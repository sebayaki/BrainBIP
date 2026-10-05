import { createWorkerOwner } from '../worker-task.js';
import { DEFAULT_GUESS_RATE, GUESS_RATES, getGuessTime, formatGuessCount } from './guess-time.js';

function formatBits(value) {
  if (!Number.isFinite(value)) return '—';
  return Math.max(0, value).toFixed(1).replace(/\.0$/, '');
}

export function createStrengthController({ getElement: $, getInputs, nextJobId, workerSource }) {
  const worker = createWorkerOwner(workerSource);
  let timer = null;
  let result = null;
  let rate = DEFAULT_GUESS_RATE;
  const rateSelect = $('guess-rate');
  for (const choice of GUESS_RATES) {
    const option = document.createElement('option');
    option.value = String(choice.value);
    option.textContent = choice.label;
    option.defaultSelected = choice.value === DEFAULT_GUESS_RATE;
    rateSelect.append(option);
  }
  const year = 365.25 * 86400;
  const ticks = [
    [1, '1 sec'],
    [60, '1 min', true],
    [3600, '1 hour'],
    [86400, '1 day', 'mid'],
    [year, '1 year', 'wide'],
    [100 * year, '100 years'],
  ];
  ticks.forEach(([seconds, label, optional]) => {
    const tick = document.createElement('span');
    tick.textContent = label;
    tick.className = optional
      ? `guess-time-tick guess-time-tick-${typeof optional === 'string' ? optional : 'extra'}`
      : 'guess-time-tick';
    tick.style.left = `${getGuessTime(Math.log2(seconds), 1).position}%`;
    $('guess-time-ticks').append(tick);
  });
  function renderRate() {
    rateSelect.value = String(rate);
    const choice = GUESS_RATES.find((entry) => entry.value === rate);
    $('strength-assumption').textContent = `Assumed total: ${choice.shortLabel}`;
  }
  function stop() {
    clearTimeout(timer);
    timer = null;
    worker.stop();
  }
  function resetDisplay(label = 'Awaiting input', state = 'empty') {
    result = null;
    $('strength-box').dataset.state = state;
    $('strength-label').textContent = label;
    $('strength-time').textContent = '—';
    $('strength-time').style.removeProperty('left');
    $('strength-marker').hidden = true;
    $('strength-marker').style.removeProperty('left');
    $('guess-time-chart').setAttribute('aria-label', label);
    $('strength-bits').textContent = '—';
    $('strength-guesses').textContent = '—';
    $('strength-feedback').textContent =
      'Common words and patterns are easier to guess. This local estimate is not measured entropy or a security guarantee.';
    $('strength-detail').textContent = '';
    $('strength-detail').hidden = true;
    $('strength-base-estimate').textContent = '';
    $('strength-base-estimate').hidden = true;
    $('strength-private-note').hidden = true;
    $('strength-caveat').textContent = 'Model estimate, not a guarantee.';
    $('strength-announcement').textContent = '';
    $('email-estimate').textContent = 'Email contributes 0 estimated bits by default.';
    renderRate();
  }
  function renderTime() {
    renderRate();
    if (!result) return;
    const { displayBits, passphraseBits, emailBits, limited } = result;
    const time = getGuessTime(displayBits, rate);
    $('strength-time').textContent = limited ? 'Limited estimate' : time.label;
    $('strength-box').dataset.state = limited ? 'limited' : 'ready';
    $('strength-label').textContent = limited ? 'Limited coverage' : 'Model estimate';
    $('strength-marker').hidden = limited;
    if (!limited) {
      $('strength-marker').style.left = `${time.position}%`;
      $('strength-time').style.left =
        `clamp(var(--guess-label-inset), ${time.position}%, calc(100% - var(--guess-label-inset)))`;
    } else {
      $('strength-time').style.removeProperty('left');
    }
    $('strength-private-note').hidden = emailBits <= 0;
    $('strength-caveat').textContent = limited
      ? 'Time hidden: language or length exceeds model coverage.'
      : 'Model estimate, not a guarantee.';
    $('strength-base-estimate').textContent = limited
      ? `Passphrase only: ${formatGuessCount(passphraseBits)}.`
      : `Passphrase only: ${getGuessTime(passphraseBits, rate).label} at this rate.`;
    $('strength-base-estimate').hidden = emailBits <= 0;
    const rateLabel = GUESS_RATES.find((entry) => entry.value === rate).label;
    const explanation = limited
      ? 'Limited model coverage. No guessing time is shown.'
      : `${time.label} at an assumed total rate of ${rateLabel}. ${emailBits > 0 ? 'Includes an assumed private, independent email. ' : ''}Model estimate, not a guarantee.`;
    $('guess-time-chart').setAttribute('aria-label', explanation);
    $('strength-announcement').textContent = explanation;
  }
  function render(data) {
    const inputs = getInputs();
    const combined = Number(data.combinedBits);
    const passphraseBits = Number(data.passphraseBits);
    const emailBits =
      inputs.privateEmail && inputs.email.length > 0 ? Math.max(0, Number(data.emailBits) || 0) : 0;
    const displayBits = Number.isFinite(combined)
      ? Math.min(128, combined)
      : Math.min(128, passphraseBits + emailBits);
    if (
      !Number.isFinite(passphraseBits) ||
      passphraseBits < 0 ||
      passphraseBits > 128 ||
      !Number.isFinite(displayBits) ||
      displayBits < 0
    ) {
      unavailable();
      return;
    }
    result = { displayBits, passphraseBits, emailBits, limited: Boolean(data.limited) };
    $('strength-bits').textContent = formatBits(displayBits);
    $('strength-guesses').textContent = formatGuessCount(displayBits);
    const feedback = Array.isArray(data.feedback) ? data.feedback.join(' ') : data.feedback;
    $('strength-feedback').textContent =
      feedback ||
      'This is estimated guesswork under a model, not true entropy or a security guarantee.';
    const parts = [`Passphrase ${formatBits(passphraseBits)} bits`];
    if (emailBits > 0) parts.push(`email +${formatBits(emailBits)} bits assumed`);
    if (combined >= 128) parts.push('model bits capped at 128');
    if (data.limited) parts.push('limited estimate');
    $('strength-detail').textContent = parts.join(' · ');
    $('strength-detail').hidden = false;
    $('email-estimate').textContent =
      inputs.privateEmail && inputs.email.length > 0
        ? data.emailAssumption ||
          `Email estimate: +${formatBits(emailBits)} bits, assuming privacy and independence. This assumption may be wrong.`
        : 'Email contributes 0 estimated bits by default.';
    renderTime();
  }
  function unavailable() {
    worker.stop();
    resetDisplay('Estimate unavailable', 'error');
    $('strength-announcement').textContent = 'Estimate unavailable.';
  }
  function schedule() {
    stop();
    resetDisplay();
    const inputs = getInputs();
    if (inputs.passphrase.length === 0) return;
    $('strength-box').dataset.state = 'estimating';
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
      resetDisplay('Estimate cancelled');
    }
  }
  function clear() {
    stop();
    rate = DEFAULT_GUESS_RATE;
    $('strength-options').open = false;
    resetDisplay();
  }
  rateSelect.addEventListener('change', () => {
    const selected = Number(rateSelect.value);
    rate = GUESS_RATES.some((entry) => entry.value === selected) ? selected : DEFAULT_GUESS_RATE;
    renderTime();
  });
  resetDisplay();
  return { schedule, cancel, clear };
}
