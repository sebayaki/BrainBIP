import { createWorkerOwner } from '../worker-task.js';

function formatBits(value) {
  if (!Number.isFinite(value)) return '—';
  return Math.max(0, value).toFixed(1).replace(/\.0$/, '');
}

export function createStrengthController({ getElement: $, getInputs, nextJobId, workerSource }) {
  const worker = createWorkerOwner(workerSource);
  let timer = null;
  function stop() {
    clearTimeout(timer);
    timer = null;
    worker.stop();
  }
  function resetDisplay() {
    $('strength-label').textContent = 'Awaiting input';
    $('strength-meter').removeAttribute('data-score');
    $('strength-bits').textContent = '—';
    $('strength-feedback').textContent =
      'Common words and patterns are easier to guess. This local estimate is not measured entropy or a security guarantee.';
    $('strength-detail').textContent = '';
    $('strength-detail').hidden = true;
    $('email-estimate').textContent = 'Email contributes 0 estimated bits by default.';
  }
  function render(result) {
    const inputs = getInputs();
    const combined = Number(result.combinedBits);
    const passphraseBits = Number(result.passphraseBits);
    const emailBits =
      inputs.privateEmail && inputs.email.length > 0
        ? Math.max(0, Number(result.emailBits) || 0)
        : 0;
    const displayBits = Number.isFinite(combined)
      ? Math.min(128, combined)
      : Math.min(128, passphraseBits + emailBits);
    $('strength-label').textContent = result.limited
      ? 'Limited estimate'
      : (result.label || 'Estimate ready').replace(' guesswork estimate', '');
    $('strength-meter').dataset.score = String(Math.max(0, Math.min(4, Number(result.score) || 0)));
    $('strength-bits').textContent = formatBits(displayBits);
    const feedback = Array.isArray(result.feedback) ? result.feedback.join(' ') : result.feedback;
    $('strength-feedback').textContent =
      feedback ||
      'This is estimated guesswork under a model, not true entropy or a security guarantee.';
    const parts = [`Passphrase ${formatBits(passphraseBits)}`];
    if (emailBits > 0) parts.push(`email +${formatBits(emailBits)} assumed`);
    if (combined >= 128) parts.push('capped at 128');
    if (result.limited) parts.push('limited estimate');
    $('strength-detail').textContent = parts.join(' · ');
    $('strength-detail').hidden = false;
    $('email-estimate').textContent =
      inputs.privateEmail && inputs.email.length > 0
        ? result.emailAssumption ||
          `Email estimate: +${formatBits(emailBits)} bits, assuming privacy and independence. This assumption may be wrong.`
        : 'Email contributes 0 estimated bits by default.';
  }
  function unavailable() {
    worker.stop();
    resetDisplay();
    $('strength-label').textContent = 'Estimate unavailable';
  }
  function schedule() {
    stop();
    resetDisplay();
    const inputs = getInputs();
    if (inputs.passphrase.length === 0) return;
    $('strength-label').textContent = 'Estimating locally…';
    $('email-estimate').textContent =
      inputs.privateEmail && inputs.email.length > 0
        ? 'Estimating under your privacy and independence assumption…'
        : 'Email contributes 0 estimated bits by default.';
    const id = nextJobId();
    timer = setTimeout(() => {
      timer = null;
      try {
        worker.start(id, getInputs(), {
          onMessage(data) {
            if (data.type === 'strength') {
              render(data.result);
              worker.stop();
            } else if (data.type === 'error') unavailable();
          },
          onError: unavailable,
        });
      } catch {
        unavailable();
      }
    }, 250);
  }
  function cancel() {
    stop();
    if ($('strength-label').textContent === 'Estimating locally…') {
      resetDisplay();
      $('strength-label').textContent = 'Estimate cancelled';
    }
  }
  function clear() {
    stop();
    resetDisplay();
  }
  return { schedule, cancel, clear };
}
