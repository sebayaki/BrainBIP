import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { keccak } from 'hash-wasm';
import { mnemonicToSeedSync } from '@scure/bip39';
import { base58xmr } from '@scure/base';
import { deriveAddresses } from '../src/crypto.js';
import {
  MONERO_PROFILE,
  deriveMoneroWallet,
  moneroAddressesFromSpendKey,
  moneroMnemonicFromSpendKey,
} from '../src/monero.js';
import { moneroEnglish } from '../src/monero-english.js';

const fixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const ledgerSpendHex = '3b094ca7218f175e91fa2402b4ae239a2fe8262792a3e718533a1a357a1e4109';

test('Ledger BIP39 derivation matches the app official published public keys and address', async () => {
  // Both the phrase and expected keys/address are published upstream test data.
  // https://github.com/LedgerHQ/app-monero/blob/develop/tests/conftest.py
  // https://github.com/LedgerHQ/app-monero/blob/develop/tests/test_crypto.py
  const expected = (await fixture('monero-ledger-v1.json')).vectors[0];
  const seed = mnemonicToSeedSync(expected.mnemonic, '');
  const wallet = deriveMoneroWallet(seed);
  const payload = base58xmr.decode(wallet.addresses[0].address);
  assert.equal(payload[0], 18);
  assert.equal(
    Buffer.from(payload.subarray(1, 33)).toString('hex'),
    expected.publishedLedger.spendPublicKeyHex,
  );
  assert.equal(
    Buffer.from(payload.subarray(33, 65)).toString('hex'),
    expected.publishedLedger.viewPublicKeyHex,
  );
  // The official Ledger test uses stagenet. Only the prefix/checksum change.
  const staged = Buffer.from(payload.subarray(0, 65));
  staged[0] = 24;
  const checksum = Buffer.from((await keccak(staged, 256)).slice(0, 8), 'hex');
  assert.equal(
    base58xmr.encode(Buffer.concat([staged, checksum])),
    expected.publishedLedger.stagenetAddress,
  );
  assert.deepEqual(
    wallet.addresses,
    moneroAddressesFromSpendKey(Buffer.from(ledgerSpendHex, 'hex')),
  );
  assert.equal(
    wallet.recovery.mnemonic,
    moneroMnemonicFromSpendKey(Buffer.from(ledgerSpendHex, 'hex')),
  );
  assert.equal(wallet.recovery.mapping, 'ledger-bip39-v1');
  assert.equal(wallet.recovery.path, "m/44'/128'/0'/0/0");
  assert.equal(seed.length, 64);
  assert.ok(
    seed.some((byte) => byte !== 0),
    'caller-owned seed is not overwritten',
  );
  seed.fill(0);
});

test('first 20 Monero mainnet addresses and 25-word recovery match frozen reference fixtures', async () => {
  const expected = await fixture('monero-ledger-v1.json');
  for (const vector of expected.vectors) {
    const seed = mnemonicToSeedSync(vector.mnemonic, '');
    const actual = deriveMoneroWallet(seed);
    assert.deepEqual(actual.addresses, vector.addresses);
    assert.deepEqual(actual.recovery, vector.recovery);
    assert.equal(actual.recovery.mnemonic.split(' ').length, 25);
    assert.equal(new Set(actual.addresses.map((row) => row.address)).size, 20);
    for (const row of actual.addresses) {
      assert.equal(row.path, MONERO_PROFILE.path);
      assert.equal(row.account, 0);
      assert.equal(row.subaddress, row.index);
      assert.equal(row.address.length, 95);
      const bytes = base58xmr.decode(row.address);
      assert.equal(bytes[0], row.index === 0 ? 18 : 42);
      assert.equal(
        Buffer.from(bytes.subarray(65)).toString('hex'),
        (await keccak(bytes.subarray(0, 65), 256)).slice(0, 8),
      );
    }
    seed.fill(0);
  }
});

test('Monero extension preserves every original four-chain fixture address', async () => {
  for (const name of ['standard-addresses.json', 'brainbip-v1.json']) {
    const expected = await fixture(name);
    const actual = deriveAddresses(expected.mnemonic);
    for (const chain of ['btc', 'eth', 'sol', 'zec'])
      assert.deepEqual(actual[chain], expected.addresses[chain]);
    const monero = (await fixture('monero-ledger-v1.json')).vectors.find(
      (vector) => vector.mnemonic === expected.mnemonic,
    );
    assert.deepEqual(actual.xmr, monero.addresses);
  }
});

test('Monero Base58 matches official core vectors including partial fixed-width blocks', async () => {
  // https://github.com/monero-project/monero/blob/master/tests/unit_tests/base58.cpp
  const vectors = [
    ['00', '11'],
    ['ff', '5Q'],
    ['ffff', 'LUv'],
    ['ffffff', '2UzHL'],
    ['ffffffff', '7YXq9G'],
    ['ffffffffff', 'VtB5VXc'],
    ['ffffffffffff', '3CUsUpv9t'],
    ['ffffffffffffff', 'Ahg1opVcGW'],
    ['ffffffffffffffff', 'jpXCZedGfVQ'],
    ['06156013762879f7ffffffffff', '22222222222VtB5VXc'],
  ];
  for (const [hex, encoded] of vectors)
    assert.equal(base58xmr.encode(Buffer.from(hex, 'hex')), encoded);
  const publicKeys = Buffer.from(
    'f724bc5c6cfbb9d97602c300423a2f28641874513a035778a0c1778d833201e9220939689edf1abd5bc1d031f73ecd6c993add66d6808870456afeb8e7eeb68d',
    'hex',
  );
  const payload = Buffer.concat([Buffer.of(18), publicKeys]);
  const checksum = Buffer.from((await keccak(payload, 256)).slice(0, 8), 'hex');
  assert.equal(
    base58xmr.encode(Buffer.concat([payload, checksum])),
    '4AzKEX4gXdJdNeM6dfiBFL7kqund3HYGvMBF3ttsNd9SfzgYB6L7ep1Yg1osYJzLdaKAYSLVh6e6jKnAuzj3bw1oGy9kXCb',
  );
});

test('Monero English wordlist and deterministic recovery parameters remain fixed', async () => {
  assert.ok(Object.isFrozen(MONERO_PROFILE));
  assert.ok(Object.isFrozen(moneroEnglish));
  assert.equal(moneroEnglish.length, 1626);
  assert.equal(new Set(moneroEnglish.map((word) => word.slice(0, 3))).size, 1626);
  const notice = await readFile(new URL('../licenses/Monero-LICENSE', import.meta.url), 'utf8');
  assert.match(notice, /Copyright \(c\) 2014-2024, The Monero Project/);
  assert.match(notice, /Neither the name of the copyright holder/);
  // Exact word data fetched from official english.h, Git blob
  // 2ec9d7b1bb2645f05a4f20f028ba9c3a672ad365 (BSD-3-Clause).
  assert.equal(
    createHash('sha256')
      .update(moneroEnglish.join('\n') + '\n')
      .digest('hex'),
    'eaa6bce7dd92f4d6dd74f224264e0ef4ad21095d68ec77616b26ceb599baf4f7',
  );
});

test('invalid Monero input/count cannot produce an alternative recovery profile', () => {
  const seed = new Uint8Array(64);
  for (const count of [0, 21, -1, 1.5, '20', NaN])
    assert.throws(() => deriveMoneroWallet(seed, count));
  for (const input of [null, '', new Uint8Array(32)])
    assert.throws(() => deriveMoneroWallet(input));
  for (const key of [new Uint8Array(32), new Uint8Array(32).fill(255), new Uint8Array(31), 'key']) {
    assert.throws(() => moneroMnemonicFromSpendKey(key));
    assert.throws(() => moneroAddressesFromSpendKey(key));
  }
  assert.equal(deriveMoneroWallet(seed, 1).addresses.length, 1);
});
