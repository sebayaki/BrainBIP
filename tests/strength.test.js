import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateStrength, ESTIMATE_MAX_CHARACTERS } from '../src/strength.js';
import { handleStrengthMessage } from '../src/strength.worker.js';

// Public synthetic fixtures: never use these examples as wallet inputs.
const independent = 'vR7!k9Q#d2M@x5F$c8N%h4J&z6P';
const privateAlias = 'h7m2w9q4s8c6n3v5';

test('recognizes dictionary, repeat and keyboard patterns rather than character count alone', () => {
  const weak = estimateStrength('password123');
  const repeated = estimateStrength('abcabcabcabcabcabc');
  const keyboard = estimateStrength('qwertyuiop123456');
  const synthetic = estimateStrength(independent);
  assert.ok(synthetic.passphraseBits > weak.passphraseBits + 30);
  assert.ok(synthetic.passphraseBits > repeated.passphraseBits + 30);
  assert.ok(synthetic.passphraseBits > keyboard.passphraseBits + 30);
  assert.ok(weak.score < synthetic.score);
  assert.match(weak.label, /estimate/);
  assert.ok(weak.feedback.some((item) => /not measured entropy/.test(item)));
});

test('empty passphrase has no strength and no email-only upgrade', () => {
  const result = estimateStrength('', `${privateAlias}@example.com`, true);
  assert.equal(result.passphraseBits, 0);
  assert.equal(result.emailBits, 0);
  assert.equal(result.combinedBits, 0);
  assert.equal(result.score, 0);
});

test('a public email never contributes secret strength', () => {
  const result = estimateStrength(independent, `${privateAlias}@example.com`);
  assert.equal(result.emailBits, 0);
  assert.equal(result.combinedBits, result.passphraseBits);
  assert.match(result.emailAssumption, /public salt/);
});

test('private independent email contributes only conditional, capped local-name credit', () => {
  const result = estimateStrength(independent, `${privateAlias}@example.com`, true);
  assert.ok(result.emailBits > 0);
  assert.ok(result.emailBits <= 32);
  assert.ok(result.combinedBits <= 128);
  assert.match(result.emailAssumption, /unknown and independent/);
  assert.match(result.emailAssumption, /Domain, case and \+tags do not count/);
  assert.equal(
    result.emailBits,
    estimateStrength(independent, `${privateAlias.toUpperCase()}+tag@example.net`, true).emailBits,
  );
});

test('reused password, username overlap and obvious substitutions do not get counted twice', () => {
  for (const [passphrase, email] of [
    ['secretpass123', 'secretpass123@example.com'],
    ['my-unique-alias secret words', 'my.unique.alias@example.com'],
    ['johnsmith', 'j0hnsm1th@example.com'],
    ['j0hnsm1th separate words', 'johnsmith@example.com'],
  ]) {
    const result = estimateStrength(passphrase, email, true);
    assert.equal(result.emailBits, 0, 'related inputs must not receive email credit');
    assert.equal(result.combinedBits, result.passphraseBits);
  }
});

test('known email information makes a matching passphrase easier to guess', () => {
  const passphrase = privateAlias;
  assert.ok(
    estimateStrength(passphrase, `${privateAlias}@example.com`).passphraseBits <
      estimateStrength(passphrase).passphraseBits,
  );
});

test('NFKC and outer-email trim match recovery semantics without trimming the passphrase', () => {
  assert.deepEqual(
    estimateStrength('Ｐａｓｓｗｏｒｄ１２３', '  ＳＥＣＲＥＴ@example.com  ', true),
    estimateStrength('Password123', 'SECRET@example.com', true),
  );
  assert.deepEqual(estimateStrength('cafe\u0301'), estimateStrength('caf\u00e9'));
  assert.notEqual(
    estimateStrength(' password123 ').passphraseBits,
    estimateStrength('password123').passphraseBits,
  );
});

test('non-English coverage is explicit and private non-English names get no credit', () => {
  const result = estimateStrength('기억하기쉬운문장여러개', '숨겨진이름@example.com', true);
  assert.equal(result.limited, true);
  assert.equal(result.emailBits, 0);
  assert.ok(result.score <= 2);
  assert.match(result.label, /Limited/);
  assert.ok(result.feedback.some((item) => /English dictionaries/.test(item)));
});

test('long input is bounded by code points, flagged and never promotes the unexamined tail', () => {
  const prefix = 'a'.repeat(ESTIMATE_MAX_CHARACTERS);
  const short = estimateStrength(prefix);
  const long = estimateStrength(prefix + independent);
  assert.equal(long.passphraseBits, short.passphraseBits);
  assert.equal(long.limited, true);
  assert.ok(long.score <= 2);
  assert.ok(long.feedback.some((item) => /first 128/.test(item)));
  assert.doesNotThrow(() => estimateStrength('😀'.repeat(128)));
  assert.equal(estimateStrength('😀'.repeat(129)).limited, true);
  assert.equal(
    estimateStrength(prefix + privateAlias, `${privateAlias}@example.com`, true).emailBits,
    0,
  );
});

test('shared text normalization keeps strength estimates independent of wallet validity limits', () => {
  // The live estimate must still handle empty/oversized text rather than adopt
  // wallet generation's nonempty requirement and 1024/320-character bounds.
  assert.equal(estimateStrength('').passphraseBits, 0);
  const oversized = estimateStrength('a'.repeat(1025), 'b'.repeat(321));
  assert.equal(
    oversized.passphraseBits,
    estimateStrength('a'.repeat(128), 'b'.repeat(128)).passphraseBits,
  );
  assert.equal(oversized.limited, true);
  assert.ok(oversized.feedback.some((item) => /first 128/.test(item)));
  // NFKC can expand a short original string beyond the model's coverage.
  assert.deepEqual(estimateStrength('ﬃ'.repeat(43)), estimateStrength('ffi'.repeat(43)));
  assert.equal(estimateStrength('ﬃ'.repeat(43)).limited, true);
  for (const [passphrase, email] of [
    ['\ud800', ''],
    ['valid', '\udc00'],
    [null, ''],
    ['valid', null],
  ]) {
    assert.throws(() => estimateStrength(passphrase, email), {
      name: 'TypeError',
      message: 'Strength estimation requires valid text.',
    });
  }
});

test('worker returns only estimates and uses a fixed safe error', () => {
  const messages = [];
  handleStrengthMessage(
    { id: 7, passphrase: independent, email: `${privateAlias}@example.com`, privateEmail: true },
    (message) => messages.push(message),
  );
  assert.equal(messages[0].id, 7);
  assert.equal(messages[0].type, 'strength');
  const encoded = JSON.stringify(messages[0]);
  assert.ok(!encoded.includes(independent));
  assert.ok(!encoded.includes(privateAlias));
  assert.ok(!encoded.includes('crackTimes'));
  handleStrengthMessage({ id: 8, passphrase: { secret: independent } }, (message) =>
    messages.push(message),
  );
  assert.deepEqual(messages[1], {
    id: 8,
    type: 'error',
    message: 'Strength estimate unavailable.',
  });
  assert.throws(() => estimateStrength('\ud800'), /valid text/);
});
