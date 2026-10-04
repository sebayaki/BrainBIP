import walletWorkerSource from './wallet.worker.js?worker';
import strengthWorkerSource from './strength.worker.js?worker';

const $ = (id) => document.getElementById(id);
const form = $('wallet-form');
const passphraseInput = $('passphrase');
const emailInput = $('email');
const privateEmailInput = $('private-email');
const generateButton = $('generate-button');
const stageOrder = ['argon2id', 'pbkdf2', 'addresses'];
const chainDetails = {
  btc: 'Bitcoin · Native SegWit receiving addresses · BIP84',
  eth: 'Ethereum · Receiving accounts · BIP44',
  sol: 'Solana · Ed25519 receiving accounts · hardened derivation',
  zec: 'Zcash · Transparent P2PKH addresses · no shielded privacy',
  xmr: 'Monero · One primary address + 19 subaddresses · Account 0',
};
let walletTask = null;
let strengthTask = null;
let jobCounter = 0;
let strengthTimer = null;
let toastTimer = null;
let currentResult = null;
let phraseVisible = false;
let moneroPhraseVisible = false;
let activeChain = 'btc';
let startedAt = 0;
let uiRevision = 0;

if (location.protocol === 'file:') $('offline-link').hidden = true;

function privateEmailEnabled() {
  return privateEmailInput.getAttribute('aria-checked') === 'true';
}

function setPrivateEmail(enabled) {
  privateEmailInput.setAttribute('aria-checked', String(enabled));
  $('private-email-state').textContent = enabled ? 'On' : 'Off';
}

function makeWorker(source, id) {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return { id, url, worker: new Worker(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function stopWorker(task) {
  if (!task) return;
  task.worker.onmessage = null;
  task.worker.onerror = null;
  task.worker.terminate();
  URL.revokeObjectURL(task.url);
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
}

function setBusy(busy) {
  $('output-panel').setAttribute('aria-busy', String(busy));
  generateButton.disabled = busy || passphraseInput.value.length === 0;
  $('generate-label').textContent = busy ? 'Deriving on your device…' : 'Generate recovery phrase';
  $('cancel-button').hidden = !busy;
}

function clearResults() {
  uiRevision += 1;
  currentResult = null;
  phraseVisible = false;
  moneroPhraseVisible = false;
  $('mnemonic-grid').replaceChildren();
  $('monero-mnemonic-grid').replaceChildren();
  $('monero-recovery-panel').hidden = true;
  $('monero-recovery-details').open = false;
  $('toggle-monero-phrase').textContent = 'Reveal';
  $('toggle-monero-phrase').setAttribute('aria-pressed', 'false');
  $('address-list').replaceChildren();
  $('chain-description').textContent = '';
  $('result-state').hidden = true;
  $('profile-tag').hidden = true;
  $('result-timing').textContent = 'Derived locally';
  $('result-profile').textContent = '';
  $('toggle-phrase').textContent = 'Reveal';
  $('toggle-phrase').setAttribute('aria-pressed', 'false');
  $('phrase-visibility-note').textContent = 'Hidden from view. Reveal when you are ready.';
}

function cancelDerivation(message = '') {
  stopWorker(walletTask);
  walletTask = null;
  $('progress-state').hidden = true;
  $('empty-state').hidden = false;
  setBusy(false);
  if (message) announce(message);
}

function setStage(stage) {
  const currentIndex = stageOrder.indexOf(stage);
  for (const item of $('stage-list').children) {
    const index = stageOrder.indexOf(item.dataset.stage);
    const state = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming';
    item.dataset.state = state;
    item.querySelector('.stage-status').textContent = state === 'complete' ? 'Complete' : state === 'current' ? 'Running' : 'Waiting';
    item.querySelector('.stage-marker').textContent = state === 'complete' ? '✓' : String(index + 1);
  }
  const announcements = { argon2id: 'Running memory-hard derivation.', pbkdf2: 'Running the second derivation.', addresses: 'Generating recovery words and receiving addresses.' };
  if (announcements[stage]) announce(announcements[stage]);
}

function renderMnemonic() {
  const grid = $('mnemonic-grid');
  const words = currentResult.mnemonic.split(' ');
  grid.replaceChildren();
  grid.dataset.visible = String(phraseVisible);
  grid.setAttribute('aria-label', phraseVisible ? 'Twelve recovery words' : 'Recovery phrase hidden');
  words.forEach((word, index) => {
    const card = document.createElement('li');
    const number = document.createElement('span');
    number.className = 'word-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const value = document.createElement('span');
    value.className = 'word-value';
    value.textContent = phraseVisible ? word : '••••••';
    if (!phraseVisible) value.setAttribute('aria-hidden', 'true');
    card.append(number, value);
    grid.append(card);
  });
  $('toggle-phrase').textContent = phraseVisible ? 'Hide' : 'Reveal';
  $('toggle-phrase').setAttribute('aria-pressed', String(phraseVisible));
  $('phrase-visibility-note').textContent = phraseVisible ? 'Keep these words private. Anyone with them controls the wallet.' : 'Hidden from view. Reveal when you are ready.';
}

function makeCopyIcon() {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', 'M5.5 5.5H13V13H5.5z M10.5 5.5V3H3v7.5h2.5');
  svg.append(path);
  return svg;
}

function renderMoneroMnemonic() {
  const grid = $('monero-mnemonic-grid');
  grid.replaceChildren();
  grid.dataset.visible = String(moneroPhraseVisible);
  const mnemonic = currentResult?.recovery?.xmr?.mnemonic;
  if (!mnemonic) return;
  grid.setAttribute('aria-label', moneroPhraseVisible ? 'Twenty-five Monero recovery words' : 'Monero recovery phrase hidden');
  for (const [index, word] of mnemonic.split(' ').entries()) {
    const card = document.createElement('li');
    const number = document.createElement('span');
    number.className = 'word-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const value = document.createElement('span');
    value.className = 'word-value';
    value.textContent = moneroPhraseVisible ? word : '••••••';
    if (!moneroPhraseVisible) value.setAttribute('aria-hidden', 'true');
    card.append(number, value);
    grid.append(card);
  }
  $('toggle-monero-phrase').textContent = moneroPhraseVisible ? 'Hide' : 'Reveal';
  $('toggle-monero-phrase').setAttribute('aria-pressed', String(moneroPhraseVisible));
}

function selectChain(chain, focus = false) {
  activeChain = chain;
  for (const tab of $('chain-tabs').children) {
    const selected = tab.dataset.chain === chain;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  $('address-panel').setAttribute('aria-labelledby', `tab-${chain}`);
  $('chain-description').textContent = chainDetails[chain];
  $('monero-recovery-panel').hidden = chain !== 'xmr' || !currentResult?.recovery?.xmr;
  if (chain !== 'xmr') {
    $('monero-recovery-details').open = false;
    moneroPhraseVisible = false;
    renderMoneroMnemonic();
  }
  const list = $('address-list');
  list.replaceChildren();
  if (!currentResult) return;
  const rows = currentResult.addresses[chain] || [];
  rows.forEach((entry, position) => {
    const row = document.createElement('tr');
    const number = document.createElement('td');
    number.textContent = String(position + 1).padStart(2, '0');
    const data = document.createElement('td');
    const address = document.createElement('span');
    address.className = 'address-text';
    address.textContent = entry.address;
    const pathDetails = document.createElement('details');
    pathDetails.className = 'address-path-details';
    const pathLabel = document.createElement('summary');
    pathLabel.textContent = chain === 'xmr' ? (position === 0 ? 'Primary · 0 / 0' : `Subaddress · 0 / ${entry.subaddress}`) : 'Derivation path';
    const path = document.createElement('span');
    path.className = 'address-path';
    path.textContent = entry.path;
    pathDetails.append(pathLabel, path);
    data.append(address, pathDetails);
    const action = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-address';
    button.setAttribute('aria-label', `Copy ${chain.toUpperCase()} receiving address ${position + 1}`);
    button.title = 'Copy address';
    button.dataset.position = String(position);
    button.append(makeCopyIcon());
    action.append(button);
    row.append(number, data, action);
    list.append(row);
  });
}

function renderResult(result) {
  currentResult = result;
  phraseVisible = false;
  $('progress-state').hidden = true;
  $('empty-state').hidden = true;
  $('result-state').hidden = false;
  $('profile-tag').hidden = false;
  $('result-profile').textContent = result.profile;
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  $('result-timing').textContent = `Derived locally in ${seconds}s`;
  renderMnemonic();
  renderMoneroMnemonic();
  selectChain(activeChain);
  setBusy(false);
  announce('Recovery phrase ready. Twelve words and twenty receiving addresses per chain have been generated. The recovery phrase is hidden.');
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
  startedAt = performance.now();
  setStage(null);
  announce('Starting local computation.');
  const id = ++jobCounter;
  try {
    walletTask = makeWorker(walletWorkerSource, id);
    walletTask.worker.onmessage = ({ data }) => {
      if (!walletTask || data.id !== walletTask.id) return;
      if (data.type === 'stage') setStage(data.stage);
      if (data.type === 'result') {
        stopWorker(walletTask);
        walletTask = null;
        renderResult(data.result);
      }
      if (data.type === 'error') {
        cancelDerivation();
        showError(data.message || 'The derivation could not finish. Try again on a device with more available memory.');
      }
    };
    walletTask.worker.onerror = () => {
      if (!walletTask || walletTask.id !== id) return;
      cancelDerivation();
      showError('The computation stopped unexpectedly. Try again, or use a browser with more available memory.');
    };
    walletTask.worker.postMessage({ id, passphrase: passphraseInput.value, email: emailInput.value });
  } catch {
    cancelDerivation();
    showError('This browser could not start local computation. Try a current browser that supports Web Workers.');
  }
}

function resetStrength() {
  $('strength-label').textContent = 'Awaiting input';
  $('strength-meter').removeAttribute('data-score');
  $('strength-bits').textContent = '—';
  $('strength-feedback').textContent = 'Common words and patterns are easier to guess. This local estimate is not measured entropy or a security guarantee.';
  $('strength-detail').textContent = '';
  $('strength-detail').hidden = true;
  $('email-estimate').textContent = 'Email contributes 0 estimated bits by default.';
}

function formatBits(value) {
  if (!Number.isFinite(value)) return '—';
  return Math.max(0, value).toFixed(1).replace(/\.0$/, '');
}

function renderStrength(result) {
  const combined = Number(result.combinedBits);
  const passphraseBits = Number(result.passphraseBits);
  const emailBits = privateEmailEnabled() && emailInput.value.length > 0 ? Math.max(0, Number(result.emailBits) || 0) : 0;
  const displayBits = Number.isFinite(combined) ? Math.min(128, combined) : Math.min(128, passphraseBits + emailBits);
  $('strength-label').textContent = result.limited ? 'Limited estimate' : (result.label || 'Estimate ready').replace(' guesswork estimate', '');
  $('strength-meter').dataset.score = String(Math.max(0, Math.min(4, Number(result.score) || 0)));
  $('strength-bits').textContent = formatBits(displayBits);
  const feedback = Array.isArray(result.feedback) ? result.feedback.join(' ') : result.feedback;
  $('strength-feedback').textContent = feedback || 'This is estimated guesswork under a model, not true entropy or a security guarantee.';
  const parts = [`Passphrase ${formatBits(passphraseBits)}`];
  if (emailBits > 0) parts.push(`email +${formatBits(emailBits)} assumed`);
  if (combined >= 128) parts.push('capped at 128');
  if (result.limited) parts.push('limited estimate');
  $('strength-detail').textContent = parts.join(' · ');
  $('strength-detail').hidden = false;
  $('email-estimate').textContent = privateEmailEnabled() && emailInput.value.length > 0
    ? (result.emailAssumption || `Email estimate: +${formatBits(emailBits)} bits, assuming privacy and independence. This assumption may be wrong.`)
    : 'Email contributes 0 estimated bits by default.';
}

function scheduleStrength() {
  clearTimeout(strengthTimer);
  strengthTimer = null;
  stopWorker(strengthTask);
  strengthTask = null;
  resetStrength();
  if (passphraseInput.value.length === 0) {
    return;
  }
  $('strength-label').textContent = 'Estimating locally…';
  $('email-estimate').textContent = privateEmailEnabled() && emailInput.value.length > 0 ? 'Estimating under your privacy and independence assumption…' : 'Email contributes 0 estimated bits by default.';
  const id = ++jobCounter;
  strengthTimer = setTimeout(() => {
    strengthTimer = null;
    try {
      strengthTask = makeWorker(strengthWorkerSource, id);
      strengthTask.worker.onmessage = ({ data }) => {
        if (!strengthTask || data.id !== strengthTask.id) return;
        if (data.type === 'strength') {
          renderStrength(data.result);
          stopWorker(strengthTask);
          strengthTask = null;
        } else if (data.type === 'error') {
          stopWorker(strengthTask);
          strengthTask = null;
          resetStrength();
          $('strength-label').textContent = 'Estimate unavailable';
        }
      };
      strengthTask.worker.onerror = () => {
        if (!strengthTask || strengthTask.id !== id) return;
        stopWorker(strengthTask);
        strengthTask = null;
        resetStrength();
        $('strength-label').textContent = 'Estimate unavailable';
      };
      strengthTask.worker.postMessage({ id, passphrase: passphraseInput.value, email: emailInput.value, privateEmail: privateEmailEnabled() });
    } catch {
      resetStrength();
      $('strength-label').textContent = 'Estimate unavailable';
    }
  }, 250);
}

function handleInputEdit() {
  const wasBusy = Boolean(walletTask);
  cancelDerivation(wasBusy ? 'Computation cancelled because an input changed.' : '');
  clearResults();
  clearError();
  clearTimeout(toastTimer);
  $('copy-status').hidden = true;
  $('copy-status').textContent = '';
  scheduleStrength();
}

function showToast(message) {
  clearTimeout(toastTimer);
  $('copy-status').textContent = message;
  $('copy-status').hidden = false;
  toastTimer = setTimeout(() => {
    $('copy-status').hidden = true;
    $('copy-status').textContent = '';
  }, 2300);
}

function fallbackCopy(value) {
  const previouslyFocused = document.activeElement;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.className = 'sr-only';
  textarea.setAttribute('readonly', '');
  document.body.append(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    if (!document.execCommand('copy')) throw new Error('Copy unavailable');
  } finally {
    textarea.value = '';
    textarea.remove();
    previouslyFocused?.focus();
  }
}

async function copyText(value, label) {
  const revision = uiRevision;
  try {
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        // Local-file clipboard permissions vary by browser.
      }
    }
    if (revision !== uiRevision) return;
    if (!copied) fallbackCopy(value);
    if (revision === uiRevision) showToast(`${label} copied.`);
  } catch {
    if (revision === uiRevision) showToast('Copy is unavailable in this browser. Reveal and select the text to copy it.');
  }
}

function resetAll({ focus = true, announceReset = true } = {}) {
  cancelDerivation();
  clearResults();
  clearError();
  clearTimeout(strengthTimer);
  strengthTimer = null;
  stopWorker(strengthTask);
  strengthTask = null;
  clearTimeout(toastTimer);
  $('copy-status').hidden = true;
  $('copy-status').textContent = '';
  form.reset();
  setPrivateEmail(false);
  passphraseInput.value = '';
  emailInput.value = '';
  passphraseInput.type = 'password';
  $('toggle-password').textContent = 'Show';
  $('toggle-password').setAttribute('aria-label', 'Show passphrase');
  $('toggle-password').setAttribute('aria-pressed', 'false');
  activeChain = 'btc';
  resetStrength();
  setBusy(false);
  setStage(null);
  if (announceReset) announce('Inputs and generated results cleared. The app does not clear the system clipboard.');
  else $('live-status').textContent = '';
  if (focus) passphraseInput.focus();
}

form.addEventListener('submit', startDerivation);
passphraseInput.addEventListener('input', handleInputEdit);
emailInput.addEventListener('input', handleInputEdit);
privateEmailInput.addEventListener('click', () => {
  setPrivateEmail(!privateEmailEnabled());
  scheduleStrength();
});
$('toggle-password').addEventListener('click', () => {
  const visible = passphraseInput.type === 'password';
  passphraseInput.type = visible ? 'text' : 'password';
  $('toggle-password').textContent = visible ? 'Hide' : 'Show';
  $('toggle-password').setAttribute('aria-label', visible ? 'Hide passphrase' : 'Show passphrase');
  $('toggle-password').setAttribute('aria-pressed', String(visible));
});
$('cancel-button').addEventListener('click', () => {
  cancelDerivation('Computation cancelled.');
  clearResults();
  clearTimeout(strengthTimer);
  strengthTimer = null;
  stopWorker(strengthTask);
  strengthTask = null;
  if ($('strength-label').textContent === 'Estimating locally…') {
    resetStrength();
    $('strength-label').textContent = 'Estimate cancelled';
  }
});
$('reset-button').addEventListener('click', resetAll);
$('toggle-phrase').addEventListener('click', () => {
  if (!currentResult) return;
  phraseVisible = !phraseVisible;
  renderMnemonic();
});
$('copy-phrase').addEventListener('click', () => {
  if (currentResult) copyText(currentResult.mnemonic, 'Recovery phrase');
});
$('toggle-monero-phrase').addEventListener('click', () => {
  if (!currentResult?.recovery?.xmr) return;
  moneroPhraseVisible = !moneroPhraseVisible;
  renderMoneroMnemonic();
});
$('copy-monero-phrase').addEventListener('click', () => {
  if (currentResult?.recovery?.xmr) copyText(currentResult.recovery.xmr.mnemonic, 'Monero recovery phrase');
});
$('monero-recovery-details').addEventListener('toggle', () => {
  if (!$('monero-recovery-details').open) {
    moneroPhraseVisible = false;
    renderMoneroMnemonic();
  }
});
$('chain-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-chain]');
  if (tab) selectChain(tab.dataset.chain);
});
$('chain-tabs').addEventListener('keydown', (event) => {
  const tabs = [...$('chain-tabs').children];
  const current = tabs.indexOf(document.activeElement);
  if (current < 0) return;
  let next = current;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % tabs.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  else return;
  event.preventDefault();
  selectChain(tabs[next].dataset.chain, true);
});
$('address-list').addEventListener('click', (event) => {
  const button = event.target.closest('.copy-address');
  if (!button || !currentResult) return;
  const entry = currentResult.addresses[activeChain][Number(button.dataset.position)];
  if (entry) copyText(entry.address, `${activeChain.toUpperCase()} address`);
});
window.addEventListener('pagehide', () => resetAll({ focus: false, announceReset: false }));
document.querySelectorAll('a[href^="#docs-"]').forEach((link) => {
  link.addEventListener('click', () => {
    const section = $(link.getAttribute('href').slice(1));
    if (section instanceof HTMLDetailsElement) section.open = true;
  });
});
