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
const MAX_SECONDS = 100 * SECONDS_PER_YEAR;
const MAX_LOG_SECONDS = Math.log10(MAX_SECONDS);
const countFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

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
  const units = [
    [60, 1, 'second'],
    [3600, 60, 'minute'],
    [86400, 3600, 'hour'],
    [SECONDS_PER_YEAR, 86400, 'day'],
    [Infinity, SECONDS_PER_YEAR, 'year'],
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
  // Compare in the input's logarithmic domain so an exact endpoint does not
  // become outside the scale through floating-point exponentiation rounding.
  const range =
    bits < Math.log2(rate) ? 'below' : bits > Math.log2(MAX_SECONDS * rate) ? 'above' : 'within';
  const position = Math.max(0, Math.min(100, (Math.log10(seconds) / MAX_LOG_SECONDS) * 100));
  const label =
    range === 'below' ? '< 1 second' : range === 'above' ? '> 100 years' : formatDuration(seconds);
  return { seconds, position, label, range };
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
