import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pbkdf2Sync } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { argon2id, createSHA256, pbkdf2 } from 'hash-wasm';
import { argon2idAsync as referenceArgon2id } from '@noble/hashes/argon2.js';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';
import Slip10 from 'micro-key-producer/slip10.js';
import {
  PROFILE,
  normalizeInputs,
  deriveAddresses,
  deriveWallet,
  safeErrorMessage,
} from '../src/crypto.js';
import * as profileModule from '../src/profiles.js';
import { referenceAddresses, referenceMnemonic } from './lib/addresses-reference.js';

const standardMnemonic =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const fixturesDirectory = new URL('./fixtures/', import.meta.url);
const fixture = async (name) =>
  JSON.parse(await readFile(new URL(name, fixturesDirectory), 'utf8'));
// Explicit maintainer-only fixture generation. This derives public test data
// through separate implementations; normal test runs never rewrite fixtures.
if (process.env.BRAINBIP_GENERATE_FIXTURE === '1') {
  const profile = PROFILE;
  const passphrase = '  BrainBIP Å test — do not fund  ';
  const email = '  Test.Vector＠Example.invalid  ';
  const normalizedPassphrase = passphrase.normalize('NFKC');
  const normalizedEmail = email.normalize('NFKC').trim();
  const password = Buffer.from(normalizedPassphrase);
  const argonSalt = Buffer.from(profile.argon2id.saltPrefix + normalizedEmail);
  const pbkdfSalt = Buffer.from(profile.pbkdf2.saltPrefix + normalizedEmail);
  const started = performance.now();
  const argonKey = await referenceArgon2id(password, argonSalt, {
    m: profile.argon2id.memoryKiB,
    t: profile.argon2id.iterations,
    p: profile.argon2id.parallelism,
    version: profile.argon2id.version,
    dkLen: profile.argon2id.outputBytes,
  });
  console.log(`Independent Argon2id reference: ${(performance.now() - started).toFixed(0)} ms`);
  const pbkdfKey = pbkdf2Sync(
    password,
    pbkdfSalt,
    profile.pbkdf2.iterations,
    profile.pbkdf2.outputBytes,
    'sha256',
  );
  const entropy = Buffer.from(
    argonKey.slice(0, profile.entropyBytesByWordCount[profile.defaultWordCount]),
  ).map((byte, index) => byte ^ pbkdfKey[index]);
  const mnemonic = referenceMnemonic(entropy);
  const production = {
    warning: 'PUBLIC TEST VECTOR. NEVER DEPOSIT FUNDS TO THESE ADDRESSES.',
    provenance:
      'Argon2id: noble-hashes independent JS implementation, cross-checked by production hash-wasm; PBKDF2, BIP39 seed, HD keys and address reference: Node/OpenSSL plus the independent test encoders.',
    profile: profile.id,
    passphrase,
    email,
    normalizedPassphrase,
    normalizedEmail,
    argonSaltHex: argonSalt.toString('hex'),
    pbkdfSaltHex: pbkdfSalt.toString('hex'),
    argonKeyHex: Buffer.from(argonKey).toString('hex'),
    pbkdfKeyHex: pbkdfKey.toString('hex'),
    entropyHex: entropy.toString('hex'),
    mnemonic,
    bip39SeedHex: pbkdf2Sync(
      Buffer.from(mnemonic.normalize('NFKD')),
      Buffer.from('mnemonic'),
      2048,
      64,
      'sha512',
    ).toString('hex'),
    addresses: await referenceAddresses(mnemonic),
  };
  await writeFile(
    new URL('brainbip-v2.json', fixturesDirectory),
    JSON.stringify(production, null, 2) + '\n',
  );
  for (const buffer of [password, argonSalt, pbkdfSalt, argonKey, pbkdfKey, entropy])
    buffer.fill(0);
  console.log('Public independent reference fixture generated.');
} else {
  test('one fixed profile exposes immutable current recovery parameters', () => {
    assert.deepEqual(Object.keys(profileModule), ['PROFILE']);
    assert.equal(PROFILE, profileModule.PROFILE);
    assert.equal(PROFILE.id, 'brainbip-v2');
    assert.deepEqual(PROFILE.argon2id, {
      version: 19,
      memoryKiB: 524288,
      iterations: 16,
      parallelism: 1,
      outputBytes: 32,
      saltPrefix: 'BrainBIP/v2/argon2id\0',
    });
    assert.deepEqual(PROFILE.pbkdf2, {
      hash: 'SHA-256',
      iterations: 5242880,
      outputBytes: 32,
      saltPrefix: 'BrainBIP/v2/pbkdf2\0',
    });
    assert.equal(PROFILE.maxPassphraseCharacters, 1024);
    assert.equal(PROFILE.maxEmailCharacters, 320);
    assert.equal(PROFILE.addressCount, 20);
    assert.equal(PROFILE.defaultWordCount, 12);
    assert.deepEqual(PROFILE.supportedWordCounts, [12, 24]);
    assert.deepEqual(PROFILE.entropyBytesByWordCount, { 12: 16, 24: 32 });
    assert.equal(PROFILE.bip39Passphrase, '');
    assert.deepEqual(PROFILE.paths, {
      btc: "m/84'/0'/0'/0/{index}",
      eth: "m/44'/60'/0'/0/{index}",
      sol: "m/44'/501'/{index}'/0'",
      zec: "m/44'/133'/0'/0/{index}",
    });
    for (const value of [
      PROFILE,
      PROFILE.argon2id,
      PROFILE.pbkdf2,
      PROFILE.paths,
      PROFILE.supportedWordCounts,
      PROFILE.entropyBytesByWordCount,
    ])
      assert.ok(Object.isFrozen(value));
    assert.throws(() => {
      PROFILE.argon2id.memoryKiB = 8;
    }, TypeError);
  });

  test('normalization preserves passphrase whitespace and all case, trims only email', () => {
    assert.deepEqual(normalizeInputs('  ＡÅe\u0301\t', '  User＠Example.COM\u00a0'), {
      passphrase: '  AÅé\t',
      email: 'User@Example.COM',
    });
    assert.deepEqual(normalizeInputs(' '), { passphrase: ' ', email: '' });
    assert.deepEqual(normalizeInputs('A', '\t \n'), { passphrase: 'A', email: '' });
    assert.notDeepEqual(
      normalizeInputs('A', 'User@example.com'),
      normalizeInputs('a', 'user@example.com'),
    );
  });

  test('input bounds count normalized Unicode codepoints and reject malformed strings', () => {
    assert.doesNotThrow(() => normalizeInputs('😀'.repeat(1024), '😀'.repeat(320)));
    assert.throws(() => normalizeInputs('😀'.repeat(1025)), /1024/);
    assert.throws(() => normalizeInputs('valid', '😀'.repeat(321)), /320/);
    assert.throws(() => normalizeInputs('ﬃ'.repeat(342)), /1024/); // NFKC expands this ligature.
    for (const input of ['', '\ud800', '\udc00']) assert.throws(() => normalizeInputs(input));
    for (const input of [null, 1, {}, undefined])
      assert.throws(() => normalizeInputs(input), TypeError);
    assert.throws(() => normalizeInputs('valid', null), TypeError);
  });

  test('wallet validation preserves exact error messages and validation order', () => {
    assert.throws(() => normalizeInputs(null, '\ud800'), {
      name: 'TypeError',
      message: 'Passphrase and email must be text.',
    });
    assert.throws(() => normalizeInputs('', '\ud800'), {
      name: 'TypeError',
      message: 'Passphrase and email must contain valid Unicode text.',
    });
    assert.throws(() => normalizeInputs('', 'a'.repeat(321)), {
      name: 'Error',
      message: 'Enter a passphrase.',
    });
    assert.throws(() => normalizeInputs('valid', '\udc00'), {
      name: 'TypeError',
      message: 'Passphrase and email must contain valid Unicode text.',
    });
    assert.throws(() => normalizeInputs('a'.repeat(1025)), {
      name: 'RangeError',
      message:
        'Passphrase must contain at most 1024 characters and email at most 320 characters after normalization.',
    });
  });

  test('hash-wasm Argon2id matches the official PHC reference vector (version 19)', async () => {
    // https://github.com/P-H-C/phc-winner-argon2/blob/master/src/test.c
    const actual = await argon2id({
      password: 'password',
      salt: 'somesalt',
      memorySize: 256,
      iterations: 2,
      parallelism: 1,
      hashLength: 32,
      outputType: 'hex',
    });
    assert.equal(actual, '9dfeb910e80bad0311fee20f9c0e2b12c17987b4cac90c2ef54d5b3021c68bfe');
  });

  test('hash-wasm PBKDF2-SHA256 matches Node/OpenSSL including embedded NUL and UTF-8', async () => {
    const password = Buffer.from(' P\0é ');
    const salt = Buffer.from('BrainBIP/v2/pbkdf2\0User@Example.invalid');
    const actual = await pbkdf2({
      password,
      salt,
      iterations: 4096,
      hashLength: 32,
      hashFunction: createSHA256(),
      outputType: 'binary',
    });
    assert.equal(
      Buffer.from(actual).toString('hex'),
      pbkdf2Sync(password, salt, 4096, 32, 'sha256').toString('hex'),
    );
  });

  test('BIP39 matches the official Trezor English test vector', () => {
    // https://github.com/trezor/python-mnemonic/blob/master/vectors.json
    assert.equal(entropyToMnemonic(new Uint8Array(16), wordlist), standardMnemonic);
    const standard24 = [...Array(23).fill('abandon'), 'art'].join(' ');
    assert.equal(entropyToMnemonic(new Uint8Array(32), wordlist), standard24);
    assert.equal(referenceMnemonic(Buffer.alloc(32)), standard24);
    assert.equal(
      Buffer.from(mnemonicToSeedSync(standardMnemonic, 'TREZOR')).toString('hex'),
      'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04',
    );
  });

  test('BIP32 matches official test vector 1 through hardened and normal children', () => {
    const root = HDKey.fromMasterSeed(Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex'));
    assert.equal(
      root.privateExtendedKey,
      'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi',
    );
    assert.equal(
      root.derive("m/0'/1/2'/2/1000000000").privateExtendedKey,
      'xprvA41z7zogVVwxVSgdKUHDy1SKmdb533PjDz7J6N6mV6uS3ze1ai8FHa8kmHScGpWmj4WggLyQjgPie1rFSruoUihUZREPSL39UNdE3BBDu76',
    );
    root.wipePrivateData();
  });

  test('SLIP10 Ed25519 matches the official vector and rejects normal children', () => {
    const root = Slip10.fromMasterSeed(Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex'));
    const child = root.derive("m/0'/1'/2'/2'/1000000000'");
    assert.equal(
      Buffer.from(root.privateKey).toString('hex'),
      '2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7',
    );
    assert.equal(
      Buffer.from(child.privateKey).toString('hex'),
      '8f94d394a8e8fd6b1bc2f3f49f5c47e385281d5c17e65324b0f62483e37e8793',
    );
    assert.equal(
      Buffer.from(child.publicKey).toString('hex'),
      '003c24da049451555d51a7014a37337aa4e12d41e485abccfa46b47dfb2af54b7a',
    );
    assert.equal(child.publicKeyRaw.length, 32);
    assert.throws(() => root.derive('m/0'));
  });

  test('all 80 mainnet addresses match independent OpenSSL HD and encoding references', async () => {
    const expected = await fixture('standard-addresses.json');
    assert.deepEqual(deriveAddresses(expected.mnemonic), expected.addresses);
    assert.deepEqual(await referenceAddresses(expected.mnemonic), expected.addresses);
    // Official BIP84 test vectors directly verify the reference Bech32 encoder.
    assert.equal(expected.addresses.btc[0].address, 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    assert.equal(expected.addresses.btc[1].address, 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
    for (const chain of ['btc', 'eth', 'sol', 'zec']) {
      assert.equal(new Set(expected.addresses[chain].map((row) => row.address)).size, 20);
      assert.deepEqual(
        expected.addresses[chain].map((row) => row.index),
        Array.from({ length: 20 }, (_, index) => index),
      );
    }
  });

  test('only valid 12- and 24-word mnemonics are accepted and whitespace is canonicalized', async () => {
    for (const count of [0, -1, 21, 1.5, NaN, '20'])
      assert.throws(() => deriveAddresses(standardMnemonic, count));
    for (const mnemonic of [
      '',
      'abandon '.repeat(12).trim(),
      'abandon '.repeat(24).trim(),
      ...[20, 24, 28].map((bytes) => entropyToMnemonic(new Uint8Array(bytes), wordlist)),
      null,
      24,
      {},
    ])
      assert.throws(() => deriveAddresses(mnemonic), {
        message: 'Enter a valid 12- or 24-word English BIP39 phrase.',
      });
    assert.deepEqual(
      deriveAddresses('  ' + standardMnemonic.replaceAll(' ', '\n') + '  ', 1),
      deriveAddresses(standardMnemonic, 1),
    );
    const expected24 = await fixture('brainbip-24.json');
    assert.deepEqual(
      deriveAddresses('  ' + expected24.mnemonic.replaceAll(' ', '\n') + '  '),
      expected24.addresses,
    );
  });

  test('24-word fixture uses the full public XOR and matches independent BIP39 and address references', async () => {
    const source = await fixture('brainbip-v2.json');
    const expected = await fixture('brainbip-24.json');
    const pbkdfKey = Buffer.from(source.pbkdfKeyHex, 'hex');
    const entropy = Buffer.from(source.argonKeyHex, 'hex').map(
      (byte, index) => byte ^ pbkdfKey[index],
    );
    assert.equal(expected.wordCount, 24);
    assert.equal(expected.profile, PROFILE.id);
    assert.equal(expected.entropyHex, entropy.toString('hex'));
    assert.equal(expected.entropyHex.slice(0, 32), source.entropyHex);
    assert.equal(referenceMnemonic(entropy), expected.mnemonic);
    assert.equal(referenceMnemonic(entropy.subarray(0, 16)), source.mnemonic);
    assert.equal(expected.mnemonic.split(' ').length, 24);
    assert.notEqual(expected.mnemonic.split(' ').slice(0, 12).join(' '), source.mnemonic);
    assert.equal(
      pbkdf2Sync(
        Buffer.from(expected.mnemonic),
        Buffer.from('mnemonic'),
        2048,
        64,
        'sha512',
      ).toString('hex'),
      expected.bip39SeedHex,
    );
    assert.deepEqual(await referenceAddresses(expected.mnemonic), expected.addresses);
    assert.deepEqual(deriveAddresses(expected.mnemonic), expected.addresses);
    for (const chain of ['btc', 'eth', 'sol', 'zec']) {
      assert.notEqual(expected.addresses[chain][0].address, source.addresses[chain][0].address);
    }
    entropy.fill(0);
    pbkdfKey.fill(0);
  });

  test('worker-facing error text never forwards raw library/input errors', () => {
    const secret = 'private-input-never-forward';
    assert.ok(!safeErrorMessage(new Error(secret)).includes(secret));
    assert.ok(!safeErrorMessage({ message: secret }).includes(secret));
    assert.equal(safeErrorMessage(new Error('Enter a passphrase.')), 'Enter a passphrase.');
    assert.equal(
      safeErrorMessage(new Error('Enter a valid 12- or 24-word English BIP39 phrase.')),
      'Enter a valid 12- or 24-word English BIP39 phrase.',
    );
  });

  test('wallet worker runs one job and returns both word counts with sanitized failures', async () => {
    const source = (
      await readFile(new URL('../src/wallet.worker.js', import.meta.url), 'utf8')
    ).replace(/^import[\s\S]*?;\n/u, '');
    const expected12 = await fixture('brainbip-v2.json');
    const expected24 = await fixture('brainbip-24.json');
    const result = {
      profile: PROFILE.id,
      wallets: {
        12: { mnemonic: expected12.mnemonic, addresses: expected12.addresses },
        24: { mnemonic: expected24.mnemonic, addresses: expected24.addresses },
      },
    };
    for (const fail of [false, true]) {
      const messages = [];
      let calls = 0;
      let closed = 0;
      const self = {
        postMessage: (message) => messages.push(message),
        close: () => {
          closed += 1;
        },
      };
      runInNewContext(source, {
        self,
        safeErrorMessage,
        deriveWallet: async (passphrase, email, onStage) => {
          calls += 1;
          assert.equal(passphrase, 'private-passphrase-never-forward');
          assert.equal(email, 'private-email-never-forward');
          if (fail) throw new Error('private-library-error-never-forward');
          for (const stage of ['argon2id', 'pbkdf2', 'addresses']) onStage(stage);
          return result;
        },
      });
      await self.onmessage({
        data: {
          id: 7,
          passphrase: 'private-passphrase-never-forward',
          email: 'private-email-never-forward',
        },
      });
      assert.equal(calls, 1);
      assert.equal(closed, 1);
      const plainMessages = JSON.parse(JSON.stringify(messages));
      if (fail) {
        assert.deepEqual(plainMessages, [
          { id: 7, type: 'error', message: safeErrorMessage(new Error('unknown')) },
        ]);
      } else {
        assert.deepEqual(plainMessages, [
          ...['argon2id', 'pbkdf2', 'addresses'].map((stage) => ({ id: 7, type: 'stage', stage })),
          { id: 7, type: 'result', result },
        ]);
      }
      assert.ok(!JSON.stringify(messages).includes('private-'));
      await self.onmessage({ data: { id: 8, passphrase: 'unused' } });
      assert.equal(calls, 1);
      assert.equal(messages.at(-1).type, 'error');
      assert.equal(closed, 1);
    }
  });

  test(
    'current fixed derivation uses full costs and matches independent Argon2id/OpenSSL reference data',
    { timeout: 120000 },
    async (context) => {
      const expected = await fixture('brainbip-v2.json');
      const expected24 = await fixture('brainbip-24.json');
      const stages = [];
      const started = performance.now();
      const actual = await deriveWallet(expected.passphrase, expected.email, (stage) =>
        stages.push(stage),
      );
      context.diagnostic(
        `One full 512 MiB/t16 Argon2id + 5,242,880 PBKDF2 + both word counts/160 addresses: ${(performance.now() - started).toFixed(0)} ms`,
      );
      assert.deepEqual(stages, ['argon2id', 'pbkdf2', 'addresses']);
      assert.deepEqual(actual, {
        profile: 'brainbip-v2',
        wallets: {
          12: { mnemonic: expected.mnemonic, addresses: expected.addresses },
          24: { mnemonic: expected24.mnemonic, addresses: expected24.addresses },
        },
      });
      assert.equal(
        Buffer.from(mnemonicToSeedSync(actual.wallets[12].mnemonic, '')).toString('hex'),
        expected.bip39SeedHex,
      );
      assert.equal(
        Buffer.from(mnemonicToSeedSync(actual.wallets[24].mnemonic, '')).toString('hex'),
        expected24.bip39SeedHex,
      );
      assert.deepEqual(await referenceAddresses(actual.wallets[12].mnemonic), expected.addresses);
      assert.deepEqual(await referenceAddresses(actual.wallets[24].mnemonic), expected24.addresses);
      const password = Buffer.from(expected.normalizedPassphrase);
      const argonSalt = Buffer.from(expected.argonSaltHex, 'hex');
      const pbkdfSalt = Buffer.from(expected.pbkdfSaltHex, 'hex');
      assert.equal(argonSalt.toString('utf8'), 'BrainBIP/v2/argon2id\0' + expected.normalizedEmail);
      assert.equal(pbkdfSalt.toString('utf8'), 'BrainBIP/v2/pbkdf2\0' + expected.normalizedEmail);
      const argonKey = await argon2id({
        password,
        salt: argonSalt,
        memorySize: 524288,
        iterations: 16,
        parallelism: 1,
        hashLength: 32,
        outputType: 'binary',
      });
      assert.equal(Buffer.from(argonKey).toString('hex'), expected.argonKeyHex);
      const pbkdfKey = pbkdf2Sync(password, pbkdfSalt, 5242880, 32, 'sha256');
      assert.equal(pbkdfKey.toString('hex'), expected.pbkdfKeyHex);
      const entropy = Buffer.from(argonKey).map((byte, index) => byte ^ pbkdfKey[index]);
      assert.equal(entropy.toString('hex'), expected24.entropyHex);
      assert.equal(entropy.subarray(0, 16).toString('hex'), expected.entropyHex);
      assert.equal(referenceMnemonic(entropy.subarray(0, 16)), actual.wallets[12].mnemonic);
      assert.equal(referenceMnemonic(entropy), actual.wallets[24].mnemonic);
      for (const bytes of [password, argonSalt, pbkdfSalt, argonKey, pbkdfKey, entropy])
        bytes.fill(0);
    },
  );
}
