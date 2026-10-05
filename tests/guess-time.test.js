import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GUESS_RATE,
  GUESS_RATES,
  getGuessTime,
  formatGuessCount,
} from '../src/ui/guess-time.js';

test('offers three explicit illustrative rates with one guess per second as the default', () => {
  assert.equal(DEFAULT_GUESS_RATE, 1);
  assert.deepEqual(
    GUESS_RATES.map(({ value, label, shortLabel }) => [value, label, shortLabel]),
    [
      [0.1, '1 guess every 10 seconds', '1 / 10 sec'],
      [1, '1 guess per second', '1 / sec'],
      [1000, '1,000 guesses per second', '1,000 / sec'],
    ],
  );
  assert.ok(Object.isFrozen(GUESS_RATES));
  assert.ok(GUESS_RATES.every(Object.isFrozen));
});

test('13.9-bit model illustrates days, hours and seconds using the full guess count', () => {
  const slow = getGuessTime(13.9, 0.1);
  const normal = getGuessTime(13.9);
  const fast = getGuessTime(13.9, 1000);
  assert.ok(Math.abs(normal.seconds - 15286.8125) < 0.001);
  assert.ok(Math.abs(slow.seconds - 152868.125) < 0.01);
  assert.ok(Math.abs(fast.seconds - 15.2868125) < 0.000001);
  assert.deepEqual([slow.label, normal.label, fast.label], ['~2 days', '~4 hours', '~15 seconds']);
  assert.equal(formatGuessCount(13.9), '~15,000 guesses');
});

test('uses the full guess count without an average-search or graph-scale assumption', () => {
  assert.deepEqual(getGuessTime(2), { seconds: 4, label: '~4 seconds' });
  assert.deepEqual(getGuessTime(2, 0.1), { seconds: 40, label: '~40 seconds' });
  assert.deepEqual(getGuessTime(2, 1000), { seconds: 0.004, label: '< 1 second' });
});

test('increasing the model guess count always increases time at a fixed assumed rate', () => {
  for (const { value: rate } of GUESS_RATES) {
    let previous = -1;
    for (const bits of [0, 1, 4, 8, 16, 24, 32, 64, 128]) {
      const result = getGuessTime(bits, rate);
      assert.ok(result.seconds > previous);
      previous = result.seconds;
    }
  }
});

test('subsecond values retain actual seconds and one second remains a normal duration', () => {
  assert.deepEqual(getGuessTime(0, 1000), {
    seconds: 0.001,
    label: '< 1 second',
  });
  assert.deepEqual(getGuessTime(0), { seconds: 1, label: '~1 second' });
  assert.equal(getGuessTime(Math.log2(1000), 1000).label, '~1 second');
  assert.equal(getGuessTime(Math.log2(1000) - 0.001, 1000).label, '< 1 second');
});

test('year labels continue beyond a century and use comma-separated whole Julian years', () => {
  const thousandYears = 31_557_600_000;
  for (const { value: rate } of GUESS_RATES) {
    const result = getGuessTime(Math.log2(thousandYears * rate), rate);
    assert.equal(result.label, '~1,000 years');
    assert.ok(Math.abs(result.seconds - thousandYears) < 0.0001);
  }
  assert.equal(getGuessTime(Math.log2(3_155_760_000)).label, '~100 years');
});

test('96-bit and 128-bit estimates show every approximate year digit at all supported rates', () => {
  const fixtures = [
    [96, 0.1, '~25,105,889,710,961,650,000,000 years'],
    [96, 1, '~2,510,588,971,096,165,000,000 years'],
    [96, 1000, '~2,510,588,971,096,165,000 years'],
    [128, 0.1, '~107,828,975,245,563,180,000,000,000,000,000 years'],
    [128, 1, '~10,782,897,524,556,317,000,000,000,000,000 years'],
    [128, 1000, '~10,782,897,524,556,317,000,000,000,000 years'],
  ];
  for (const [bits, rate, label] of fixtures) {
    const result = getGuessTime(bits, rate);
    assert.equal(result.label, label);
    assert.match(result.label, /^~\d{1,3}(,\d{3})+ years$/);
    assert.ok(Number.isFinite(result.seconds));
  }
});

test('duration labels use familiar units with correct singular forms', () => {
  assert.equal(getGuessTime(Math.log2(60)).label, '~1 minute');
  assert.equal(getGuessTime(Math.log2(3600)).label, '~1 hour');
  assert.equal(getGuessTime(Math.log2(86400)).label, '~1 day');
  assert.equal(getGuessTime(Math.log2(31_557_600)).label, '~1 year');
  assert.equal(getGuessTime(Math.log2(63_115_200)).label, '~2 years');
});

test('guess counts remain concise from a single guess to the model ceiling', () => {
  assert.equal(formatGuessCount(0), '~1 guess');
  assert.equal(formatGuessCount(10), '~1,000 guesses');
  assert.equal(formatGuessCount(20), '~1 million guesses');
  assert.equal(formatGuessCount(30), '~1.1 billion guesses');
  assert.equal(formatGuessCount(40), '~1.1 trillion guesses');
  assert.equal(formatGuessCount(128), '~3.4 × 10^38 guesses');
});

test('invalid estimates and unsupported rates cannot produce misleading UI values', () => {
  for (const bits of [NaN, Infinity, -Infinity, null, undefined, '13.9', {}, 13n]) {
    assert.throws(() => getGuessTime(bits), TypeError);
    assert.throws(() => formatGuessCount(bits), TypeError);
  }
  for (const bits of [-0.001, 128.001]) {
    assert.throws(() => getGuessTime(bits), RangeError);
    assert.throws(() => formatGuessCount(bits), RangeError);
  }
  for (const rate of [NaN, Infinity, null, '1', {}]) {
    assert.throws(() => getGuessTime(13.9, rate), TypeError);
  }
  for (const rate of [0, -1, 0.01, 10, 100, 1001]) {
    assert.throws(() => getGuessTime(13.9, rate), RangeError);
  }
});
