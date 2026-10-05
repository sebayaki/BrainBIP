export const DEFAULT_GUESS_RATE = 1;

export const GUESS_RATES = Object.freeze([
  Object.freeze({
    value: 0.1,
    label: '1 guess every 10 seconds',
    shortLabel: '1 / 10 sec',
  }),
  Object.freeze({
    value: 1,
    label: '1 guess per second',
    shortLabel: '1 / sec',
  }),
  Object.freeze({
    value: 1000,
    label: '1,000 guesses per second',
    shortLabel: '1,000 / sec',
  }),
]);

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;
const countFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const yearFormat = new Intl.NumberFormat('en-US', {
  notation: 'standard',
  maximumFractionDigits: 0,
});

function validateBits(bits) {
  if (typeof bits !== 'number' || !Number.isFinite(bits)) {
    throw new TypeError('Guess estimates require a finite number.');
  }
  if (bits < 0 || bits > 128) {
    throw new RangeError('Guess estimates must be between 0 and 128 bits.');
  }
}

function validateRate(rate) {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) {
    throw new TypeError('Guess rates require a finite number.');
  }
  if (!GUESS_RATES.some((choice) => choice.value === rate)) {
    throw new RangeError('Choose a supported guess rate.');
  }
}

function formatDuration(seconds) {
  if (seconds < 1) return '< 1 second';
  if (seconds >= SECONDS_PER_YEAR) {
    const years = seconds / SECONDS_PER_YEAR;
    return `~${yearFormat.format(years)} ${Math.round(years) === 1 ? 'year' : 'years'}`;
  }
  const units = [
    [60, 1, 'second'],
    [3600, 60, 'minute'],
    [86400, 3600, 'hour'],
    [SECONDS_PER_YEAR, 86400, 'day'],
  ];
  const [, divisor, unit] = units.find(([limit]) => seconds < limit);
  const value = Math.round(seconds / divisor);
  return `~${value} ${unit}${value === 1 ? '' : 's'}`;
}

// These are illustrative scenarios, not measured attacker performance.
// Use the full model guess count; no average-search (N / 2) assumption is added.
export function getGuessTime(bits, rate = DEFAULT_GUESS_RATE) {
  validateBits(bits);
  validateRate(rate);

  const seconds = 2 ** bits / rate;
  return { seconds, label: formatDuration(seconds) };
}

export function formatGuessCount(bits) {
  validateBits(bits);
  const count = 2 ** bits;
  const rounded = count < 1000 ? Math.round(count) : Number(count.toPrecision(2));

  if (rounded >= 1e15) {
    const [coefficient, exponent] = rounded.toExponential(1).split('e');
    return `~${Number(coefficient)} × 10^${Number(exponent)} guesses`;
  }

  const units = [
    [1e12, 'trillion'],
    [1e9, 'billion'],
    [1e6, 'million'],
  ];
  const unit = units.find(([divisor]) => rounded >= divisor);
  if (unit) {
    return `~${countFormat.format(rounded / unit[0])} ${unit[1]} guesses`;
  }
  return `~${countFormat.format(rounded)} ${rounded === 1 ? 'guess' : 'guesses'}`;
}
