import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import {
  DERIVATION_ERROR_MESSAGES,
  getDerivationPresets,
  resolveDerivation,
} from '../src/derivation-paths.js';
import {
  PROFILE,
  deriveAddresses,
  deriveChainAddresses,
  safeErrorMessage,
  safeAddressErrorMessage,
} from '../src/crypto.js';
import { referenceChainAddresses } from './lib/addresses-reference.js';

const fixture = async (name) =>
  JSON.parse(await readFile(new URL('./fixtures/' + name, import.meta.url), 'utf8'));
const standardMnemonic =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const chains = ['btc', 'eth', 'sol', 'zec'];

test('presets are immutable and retain all existing default path templates', () => {
  for (const chain of chains) {
    const presets = getDerivationPresets(chain);
    assert.ok(Object.isFrozen(presets));
    assert.equal(presets[0].id, 'standard');
    assert.equal(presets[0].path, PROFILE.paths[chain]);
    assert.equal(resolveDerivation(chain).path, PROFILE.paths[chain]);
    assert.ok(Object.isFrozen(resolveDerivation(chain)));
    for (const preset of presets) assert.ok(Object.isFrozen(preset));
    assert.throws(() => presets.push({}), TypeError);
    assert.throws(() => {
      presets[0].path = "m/{index}'";
    }, TypeError);
  }
});

test('preset ids resolve to the documented wallet paths and Bitcoin encoding types', () => {
  const expected = {
    btc: [
      ['standard', "m/84'/0'/0'/0/{index}", 'native'],
      ['nested-segwit', "m/49'/0'/0'/0/{index}", 'nested'],
      ['legacy', "m/44'/0'/0'/0/{index}", 'legacy'],
    ],
    eth: [
      ['standard', "m/44'/60'/0'/0/{index}"],
      ['ledger-legacy', "m/44'/60'/0'/{index}"],
      ['ledger-live', "m/44'/60'/{index}'/0/0"],
    ],
    sol: [
      ['standard', "m/44'/501'/{index}'/0'"],
      ['bip44', "m/44'/501'/{index}'"],
    ],
    zec: [['standard', "m/44'/133'/0'/0/{index}"]],
  };
  for (const [chain, definitions] of Object.entries(expected)) {
    assert.deepEqual(
      getDerivationPresets(chain).map(({ id, path, addressType }) => [
        id,
        path,
        ...(addressType ? [addressType] : []),
      ]),
      definitions,
    );
    for (const [presetId, path, addressType] of definitions) {
      assert.deepEqual(resolveDerivation(chain, { presetId }), {
        path,
        ...(addressType ? { addressType } : {}),
      });
    }
  }
});

test('unsupported chains and malformed or conflicting selections use fixed safe errors', () => {
  for (const chain of [null, 1, {}, '', 'BTC', 'constructor', '__proto__', 'xmr']) {
    assert.throws(() => getDerivationPresets(chain), { message: DERIVATION_ERROR_MESSAGES.chain });
    assert.throws(() => resolveDerivation(chain), { message: DERIVATION_ERROR_MESSAGES.chain });
  }
  for (const selection of [null, '', 1, [], {}, { presetId: null }, { presetId: 'unknown' }]) {
    assert.throws(() => resolveDerivation('eth', selection), {
      message: DERIVATION_ERROR_MESSAGES.preset,
    });
  }
  for (const selection of [
    { presetId: 'standard', customPath: 'private-user-text' },
    { presetId: 'standard', addressType: 'legacy' },
    { presetId: 'standard', path: "m/{index}'" },
  ]) {
    assert.throws(() => resolveDerivation('btc', selection), {
      message: DERIVATION_ERROR_MESSAGES.options,
    });
  }
  for (const message of Object.values(DERIVATION_ERROR_MESSAGES)) {
    assert.equal(safeErrorMessage(new Error(message)), message);
    assert.equal(safeAddressErrorMessage(new Error(message)), message);
    assert.ok(!message.includes('private-user-text'));
  }
  assert.equal(
    safeAddressErrorMessage(new Error('private-user-text')),
    'Address calculation failed. Try another derivation path.',
  );
});

test('custom templates accept one bounded canonical index component and optional hardening', () => {
  for (const customPath of [
    'm/{index}',
    "m/{index}'",
    "m/2147483647'/{index}/0",
    'm/0/1/2/3/4/5/6/7/8/{index}',
  ]) {
    assert.deepEqual(resolveDerivation('eth', { presetId: 'custom', customPath }), {
      path: customPath,
    });
  }
  assert.deepEqual(
    resolveDerivation('sol', { presetId: 'custom', customPath: "m/44'/501'/7'/{index}'" }),
    { path: "m/44'/501'/7'/{index}'" },
  );
});

test('custom templates reject malformed, ambiguous, oversized and out-of-range components', () => {
  for (const customPath of [
    undefined,
    null,
    1,
    '',
    'm',
    'M/{index}',
    ' m/{index}',
    'm/{index} ',
    'm//{index}',
    'm/{index}/',
    'm/0',
    'm/{index}/{index}',
    'm/{index}/{index}\u0027',
    'm/{index}x',
    'm/{index}h',
    'm/{index}\u2019',
    'm/{index}/0\n',
    'm/0\r/{index}',
    'm/{index}/0\u2028',
    'm/0\u2029/{index}',
    'm/01/{index}',
    'm/+1/{index}',
    'm/-1/{index}',
    'm/0x1/{index}',
    'm/1.5/{index}',
    'm/1e3/{index}',
    'm/2147483648/{index}',
    'm/9007199254740993/{index}',
    'm/0/1/2/3/4/5/6/7/8/9/{index}',
    'm/' + '1'.repeat(161) + '/{index}',
  ]) {
    assert.throws(() => resolveDerivation('eth', { presetId: 'custom', customPath }), {
      message: DERIVATION_ERROR_MESSAGES.path,
    });
  }
  for (const customPath of ["m/44/501'/{index}'", "m/44'/501'/{index}"]) {
    assert.throws(() => resolveDerivation('sol', { presetId: 'custom', customPath }), {
      message: DERIVATION_ERROR_MESSAGES.hardened,
    });
  }
});

test('custom Bitcoin paths require an explicit encoding and other chains reject that option', () => {
  const customPath = "m/84'/0'/2'/0/{index}";
  for (const addressType of [undefined, null, '', 'p2tr', 'Native', {}, 1]) {
    assert.throws(() => resolveDerivation('btc', { presetId: 'custom', customPath, addressType }), {
      message: DERIVATION_ERROR_MESSAGES.addressType,
    });
  }
  for (const addressType of ['native', 'nested', 'legacy']) {
    assert.deepEqual(resolveDerivation('btc', { presetId: 'custom', customPath, addressType }), {
      path: customPath,
      addressType,
    });
  }
  assert.throws(
    () => resolveDerivation('zec', { presetId: 'custom', customPath, addressType: 'native' }),
    { message: DERIVATION_ERROR_MESSAGES.options },
  );
});

test('chain and path validation occur before mnemonic derivation with no reflected inputs', () => {
  const mnemonic = 'private-user-text';
  assert.throws(() => deriveChainAddresses(mnemonic, 'private-chain'), {
    message: DERIVATION_ERROR_MESSAGES.chain,
  });
  assert.throws(
    () => deriveChainAddresses(mnemonic, 'eth', { presetId: 'custom', customPath: mnemonic }),
    { message: DERIVATION_ERROR_MESSAGES.path },
  );
  assert.throws(() => deriveChainAddresses(mnemonic, 'eth', { presetId: 'standard' }), {
    message: 'Enter a valid 12- or 24-word English BIP39 phrase.',
  });
  for (const count of [0, 21, -1, 1.5, '20']) {
    assert.throws(() => deriveChainAddresses(standardMnemonic, 'eth', undefined, count), {
      message: 'Address count must be an integer from 1 to 20.',
    });
  }
});

test('all presets and custom examples match 260 independently generated reference addresses', async () => {
  const expected = await fixture('address-presets.json');
  assert.equal(expected.vectors.length, 13);
  assert.equal(expected.mnemonic, (await fixture('brainbip-v2.json')).mnemonic);
  for (const { chain, selection, rows } of expected.vectors) {
    assert.equal(rows.length, 20);
    assert.deepEqual(deriveChainAddresses(expected.mnemonic, chain, selection), rows);
    const { path, addressType } = resolveDerivation(chain, selection);
    assert.deepEqual(
      await referenceChainAddresses(expected.mnemonic, chain, path, addressType),
      rows,
    );
    assert.equal(new Set(rows.map(({ address }) => address)).size, 20);
  }
});

test('default chain derivation preserves both existing sets of 80 addresses exactly', async () => {
  for (const name of ['brainbip-v2.json', 'standard-addresses.json']) {
    const expected = await fixture(name);
    assert.deepEqual(deriveAddresses(expected.mnemonic), expected.addresses);
    for (const chain of chains) {
      assert.deepEqual(deriveChainAddresses(expected.mnemonic, chain), expected.addresses[chain]);
    }
  }
});

test('24-word mnemonics derive every preset and custom example through the same validated paths', async () => {
  const expected = await fixture('brainbip-24.json');
  assert.deepEqual(deriveAddresses(expected.mnemonic), expected.addresses);
  const presets = await fixture('address-presets.json');
  for (const { chain, selection } of presets.vectors) {
    const { path, addressType } = resolveDerivation(chain, selection);
    assert.deepEqual(
      deriveChainAddresses(expected.mnemonic, chain, selection),
      await referenceChainAddresses(expected.mnemonic, chain, path, addressType),
    );
  }
});

test('Bitcoin native, nested and legacy encodings match published SLIP-0132 mainnet vectors', () => {
  // https://github.com/satoshilabs/slips/blob/master/slip-0132.md#bitcoin-test-vectors
  const vectors = [
    ['standard', 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'],
    ['nested-segwit', '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf'],
    ['legacy', '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA'],
  ];
  for (const [presetId, address] of vectors) {
    assert.equal(
      deriveChainAddresses(standardMnemonic, 'btc', { presetId }, 1)[0].address,
      address,
    );
  }
});

test('custom paths handle an index at the root, mid-path and hardened boundary correctly', async () => {
  for (const [chain, customPath] of [
    ['eth', 'm/{index}'],
    ['eth', "m/{index}'/0/1"],
    ['eth', "m/2147483647'/{index}/2147483647"],
    ['sol', "m/{index}'/0'"],
  ]) {
    const selection = { presetId: 'custom', customPath };
    assert.deepEqual(
      deriveChainAddresses(standardMnemonic, chain, selection, 3),
      await referenceChainAddresses(standardMnemonic, chain, customPath, undefined, 3),
    );
  }
  const customPath = "m/44'/0'/0'/0/{index}";
  for (const addressType of ['native', 'nested', 'legacy']) {
    assert.deepEqual(
      deriveChainAddresses(
        standardMnemonic,
        'btc',
        { presetId: 'custom', customPath, addressType },
        3,
      ),
      await referenceChainAddresses(standardMnemonic, 'btc', customPath, addressType, 3),
    );
  }
});

test('address worker sends only rows or sanitized errors and closes after one request', async () => {
  const source = (
    await readFile(new URL('../src/addresses.worker.js', import.meta.url), 'utf8')
  ).replace(/^import[\s\S]*?;\n/u, '');
  const expected = await fixture('address-presets.json');
  const expected24 = await fixture('brainbip-24.json');
  const vector = expected.vectors[0];
  for (const mnemonic of [expected.mnemonic, expected24.mnemonic, 'private-user-text']) {
    const valid = mnemonic !== 'private-user-text';
    const messages = [];
    let closed = 0;
    const self = {
      postMessage: (message) => messages.push(message),
      close: () => {
        closed += 1;
      },
    };
    runInNewContext(source, { self, deriveChainAddresses, safeAddressErrorMessage });
    self.onmessage({
      data: {
        id: 7,
        mnemonic,
        chain: vector.chain,
        selection: vector.selection,
      },
    });
    assert.equal(closed, 1);
    assert.equal(messages.length, 1);
    if (valid) {
      assert.deepEqual(JSON.parse(JSON.stringify(messages[0])), {
        id: 7,
        type: 'result',
        rows: mnemonic === expected24.mnemonic ? expected24.addresses.btc : vector.rows,
      });
    } else {
      assert.deepEqual(JSON.parse(JSON.stringify(messages[0])), {
        id: 7,
        type: 'error',
        message: 'Enter a valid 12- or 24-word English BIP39 phrase.',
      });
    }
    assert.ok(!JSON.stringify(messages).includes('private-user-text'));
    assert.ok(!Object.hasOwn(messages[0], 'mnemonic'));
    self.onmessage({ data: { id: 8, mnemonic: expected.mnemonic, chain: vector.chain } });
    assert.equal(messages.length, 2);
    assert.equal(messages[1].type, 'error');
    assert.equal(closed, 1);
  }
});
