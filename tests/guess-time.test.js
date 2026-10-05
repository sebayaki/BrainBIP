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
  assert.ok(slow.position > normal.position && normal.position > fast.position);
  assert.ok([slow, normal, fast].every(({ range }) => range === 'within'));
});

test('fixed logarithmic scale gives equal spacing to equal orders of magnitude', () => {
  const tenSeconds = getGuessTime(Math.log2(10));
  const hundredSeconds = getGuessTime(Math.log2(100));
  const thousandSeconds = getGuessTime(Math.log2(1000));
  assert.ok(tenSeconds.position > 0 && thousandSeconds.position < 100);
  assert.ok(
    Math.abs(
      hundredSeconds.position -
        tenSeconds.position -
        (thousandSeconds.position - hundredSeconds.position),
    ) < 1e-10,
  );
  assert.equal(getGuessTime(Math.log2(1000), 1000).position, 0);
});

test('increasing the model guess count moves monotonically along the same axis', () => {
  for (const { value: rate } of GUESS_RATES) {
    let previous = -1;
    for (const bits of [0, 1, 4, 8, 16, 24, 32, 64, 128]) {
      const result = getGuessTime(bits, rate);
      assert.ok(result.position >= previous);
      assert.ok(result.position >= 0 && result.position <= 100);
      previous = result.position;
    }
  }
});

test('subsecond and century-overflow scenarios retain their actual seconds and clamp the marker', () => {
  assert.deepEqual(getGuessTime(0, 1000), {
    seconds: 0.001,
    position: 0,
    label: '< 1 second',
    range: 'below',
  });
  const largest = getGuessTime(128);
  assert.ok(largest.seconds > 3e38);
  assert.equal(largest.position, 100);
  assert.equal(largest.label, '> 100 years');
  assert.equal(largest.range, 'above');
});

test('one second and 100 Julian years remain inside the scale at their exact boundaries', () => {
  const oneSecond = getGuessTime(0);
  assert.equal(oneSecond.label, '~1 second');
  assert.equal(oneSecond.range, 'within');
  assert.equal(oneSecond.position, 0);

  const hundredYears = 3_155_760_000;
  for (const { value: rate } of GUESS_RATES) {
    const boundaryBits = Math.log2(hundredYears * rate);
    const boundary = getGuessTime(boundaryBits, rate);
    assert.equal(boundary.range, 'within');
    assert.equal(boundary.label, '~100 years');
    assert.ok(Math.abs(boundary.seconds - hundredYears) < 0.00001);
    assert.ok(Math.abs(boundary.position - 100) < 1e-10);
    assert.equal(getGuessTime(boundaryBits - 0.001, rate).range, 'within');
    assert.equal(getGuessTime(boundaryBits + 0.001, rate).range, 'above');
  }
  const fastOneSecond = Math.log2(1000);
  assert.equal(getGuessTime(fastOneSecond, 1000).range, 'within');
  assert.equal(getGuessTime(fastOneSecond - 0.001, 1000).range, 'below');
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
