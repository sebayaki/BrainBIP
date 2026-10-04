import walletWorkerSource from './wallet.worker.js?worker';
import addressWorkerSource from './addresses.worker.js?worker';
import strengthWorkerSource from './strength.worker.js?worker';
import { createWorkerOwner } from './worker-task.js';
import { createClipboardController } from './ui/clipboard.js';
import { createRecoveryView } from './ui/recovery.js';
import { createStrengthController } from './ui/strength.js';
import { createProgressController } from './ui/progress.js';
import { PROFILE } from './profiles.js';

const $ = (id) => document.getElementById(id);
const form = $('wallet-form');
const passphraseInput = $('passphrase');
const emailInput = $('email');
const privateEmailInput = $('private-email');
const generateButton = $('generate-button');
let jobCounter = 0;
let uiRevision = 0;
let scrollFrame = 0;

const wallet = createWorkerOwner(walletWorkerSource);
const clipboard = createClipboardController($('copy-status'), () => uiRevision);
const recovery = createRecoveryView({
  getElement: $,
  copyText: clipboard.copyText,
  workerSource: addressWorkerSource,
  nextJobId: () => ++jobCounter,
  onAddressChange: () => {
    uiRevision += 1;
    clipboard.clear();
  },
});
const progress = createProgressController({ getElement: $ });
const strength = createStrengthController({
  getElement: $,
  getInputs: () => ({
    passphrase: passphraseInput.value,
    email: emailInput.value,
    privateEmail: privateEmailEnabled(),
  }),
  nextJobId: () => ++jobCounter,
  workerSource: strengthWorkerSource,
});

if (location.protocol === 'file:') $('offline-link').hidden = true;

function privateEmailEnabled() {
  return privateEmailInput.getAttribute('aria-checked') === 'true';
}

function setPrivateEmail(enabled) {
  privateEmailInput.setAttribute('aria-checked', String(enabled));
  $('private-email-state').textContent = enabled ? 'On' : 'Off';
}

function announce(message) {
  $('live-status').textContent = message;
}

function clearError() {
  $('input-error').hidden = true;
  $('input-error').textContent = '';
}

function showError(message) {
  $('input-error').textContent = message;
  $('input-error').hidden = false;
  if (window.matchMedia('(max-width: 880px)').matches) {
    $('input-error').scrollIntoView({ behavior: 'instant', block: 'center' });
  }
}

function setBusy(busy) {
  $('output-panel').setAttribute('aria-busy', String(busy));
  generateButton.disabled = busy || passphraseInput.value.length === 0;
  $('generate-label').textContent = busy ? 'Deriving on your device…' : 'Generate recovery phrase';
  $('cancel-button').hidden = !busy;
}

function clearResults() {
  uiRevision += 1;
  recovery.clear();
}

function cancelDerivation(message = '') {
  wallet.stop();
  progress.stop();
  cancelAnimationFrame(scrollFrame);
  scrollFrame = 0;
  $('progress-state').hidden = true;
  $('empty-state').hidden = false;
  setBusy(false);
  if (message) announce(message);
}

function setStage(stage) {
  progress.setStage(stage);
  const announcements = {
    argon2id: 'Running memory-hard derivation.',
    pbkdf2: 'Running the second derivation.',
    addresses: 'Generating recovery words and receiving addresses.',
  };
  if (announcements[stage]) announce(announcements[stage]);
}

function revealProgressOnMobile() {
  if (!window.matchMedia('(max-width: 880px)').matches) return;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    if (!wallet.isRunning()) return;
    const panel = $('output-panel');
    panel.focus({ preventScroll: true });
    panel.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  });
}

function startDerivation(event) {
  event.preventDefault();
  if (passphraseInput.value.length === 0) {
    showError('Enter a passphrase to begin.');
    passphraseInput.focus();
    return;
  }
  cancelDerivation();
  clearResults();
  clearError();
  $('empty-state').hidden = true;
  $('progress-state').hidden = false;
  setBusy(true);
  announce('Starting local computation.');
  try {
    progress.start(PROFILE);
    wallet.start(
      ++jobCounter,
      { passphrase: passphraseInput.value, email: emailInput.value },
      {
        onMessage(data) {
          if (data.type === 'stage') setStage(data.stage);
          if (data.type === 'result') {
            wallet.stop();
            progress.setStage('complete');
            progress.stop();
            recovery.show(data.result, progress.elapsedSeconds().toFixed(1));
            setBusy(false);
            announce(
              'Recovery phrase ready. Twelve words and twenty receiving addresses per chain have been generated. The recovery phrase is hidden.',
            );
          }
          if (data.type === 'error') {
            cancelDerivation();
            showError(
              data.message ||
                'The derivation could not finish. Try again on a device with more available memory.',
            );
          }
        },
        onError() {
          cancelDerivation();
          showError(
            'The computation stopped unexpectedly. Try again, or use a browser with more available memory.',
          );
        },
      },
    );
    revealProgressOnMobile();
  } catch {
    cancelDerivation();
    showError(
      'This browser could not start local computation. Try a current browser that supports Web Workers.',
    );
  }
}

function handleInputEdit() {
  const wasBusy = wallet.isRunning();
  cancelDerivation(wasBusy ? 'Computation cancelled because an input changed.' : '');
  clearResults();
  clearError();
  clipboard.clear();
  strength.schedule();
}

function resetAll({ focus = true, announceReset = true } = {}) {
  cancelDerivation();
  clearResults();
  clearError();
  strength.clear();
  clipboard.clear();
  form.reset();
  setPrivateEmail(false);
  passphraseInput.value = '';
  emailInput.value = '';
  passphraseInput.type = 'password';
  $('toggle-password').textContent = 'Show';
  $('toggle-password').setAttribute('aria-label', 'Show passphrase');
  $('toggle-password').setAttribute('aria-pressed', 'false');
  recovery.resetChain();
  setBusy(false);
  setStage(null);
  if (announceReset)
    announce('Inputs and generated results cleared. The app does not clear the system clipboard.');
  else $('live-status').textContent = '';
  if (focus) passphraseInput.focus();
}

form.addEventListener('submit', startDerivation);
passphraseInput.addEventListener('input', handleInputEdit);
emailInput.addEventListener('input', handleInputEdit);
privateEmailInput.addEventListener('click', () => {
  setPrivateEmail(!privateEmailEnabled());
  strength.schedule();
});
$('toggle-password').addEventListener('click', () => {
  const visible = passphraseInput.type === 'password';
  passphraseInput.type = visible ? 'text' : 'password';
  $('toggle-password').textContent = visible ? 'Hide' : 'Show';
  $('toggle-password').setAttribute('aria-label', visible ? 'Hide passphrase' : 'Show passphrase');
  $('toggle-password').setAttribute('aria-pressed', String(visible));
});
function handleCancel() {
  cancelDerivation('Computation cancelled.');
  clearResults();
  strength.cancel();
}
$('cancel-button').addEventListener('click', handleCancel);
$('progress-cancel-button').addEventListener('click', handleCancel);
$('reset-button').addEventListener('click', resetAll);
window.addEventListener('pagehide', () => resetAll({ focus: false, announceReset: false }));
document.querySelectorAll('a[href^="#docs-"]').forEach((link) => {
  link.addEventListener('click', () => {
    const section = $(link.getAttribute('href').slice(1));
    if (section instanceof HTMLDetailsElement) section.open = true;
  });
});
