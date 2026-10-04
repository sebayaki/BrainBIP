import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  createHash,
  createHmac,
  createECDH,
  createPrivateKey,
  createPublicKey,
  pbkdf2Sync,
} from 'node:crypto';
import { argon2id, createSHA256, pbkdf2, keccak } from 'hash-wasm';
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
import {
  PROFILES,
  DEFAULT_PROFILE_ID,
  PROFILE_V1,
  PROFILE_V2,
  getProfile,
} from '../src/profiles.js';

const standardMnemonic =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const fixturesDirectory = new URL('./fixtures/', import.meta.url);
const fixture = async (name) =>
  JSON.parse(await readFile(new URL(name, fixturesDirectory), 'utf8'));
const originalChains = (addresses) =>
  Object.fromEntries(['btc', 'eth', 'sol', 'zec'].map((chain) => [chain, addresses[chain]]));
const hash = (algorithm, data) => createHash(algorithm).update(data).digest();
const sha256 = (data) => hash('sha256', data);
const hash160 = (data) => hash('ripemd160', sha256(data));
const hmac512 = (key, data) => createHmac('sha512', key).update(data).digest();
const curveOrder = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
const integer = (bytes) => BigInt('0x' + bytes.toString('hex'));
const serialize256 = (value) => Buffer.from(value.toString(16).padStart(64, '0'), 'hex');

// Test reference deliberately uses Node/OpenSSL rather than the production
// noble/scure curve, HMAC, PBKDF2, HD, Base58 or Bech32 implementations.
function secpPublic(privateKey, compressed = true) {
  const key = createECDH('secp256k1');
  key.setPrivateKey(privateKey);
  return key.getPublicKey(undefined, compressed ? 'compressed' : 'uncompressed');
}

function referenceSecpKey(seed, path) {
  let state = hmac512('Bitcoin seed', seed);
  let privateKey = state.subarray(0, 32);
  let chainCode = state.subarray(32);
  for (const component of path.split('/').slice(1)) {
    const hardened = component.endsWith("'");
    const index = Number.parseInt(component, 10) + (hardened ? 0x80000000 : 0);
    const serialIndex = Buffer.alloc(4);
    serialIndex.writeUInt32BE(index);
    const data = Buffer.concat([
      hardened ? Buffer.concat([Buffer.of(0), privateKey]) : secpPublic(privateKey),
      serialIndex,
    ]);
    state = hmac512(chainCode, data);
    const tweak = integer(state.subarray(0, 32));
    assert.ok(tweak < curveOrder, 'reference fixture encountered an invalid BIP32 child');
    const child = (integer(privateKey) + tweak) % curveOrder;
    assert.ok(child !== 0n, 'reference fixture encountered an invalid BIP32 child');
    privateKey = serialize256(child);
    chainCode = state.subarray(32);
  }
  return privateKey;
}

function referenceEdKey(seed, path) {
  let state = hmac512('ed25519 seed', seed);
  for (const component of path.split('/').slice(1)) {
    assert.ok(component.endsWith("'"), 'Ed25519 path must be hardened');
    const index = Number.parseInt(component, 10) + 0x80000000;
    const serialIndex = Buffer.alloc(4);
    serialIndex.writeUInt32BE(index);
    state = hmac512(
      state.subarray(32),
      Buffer.concat([Buffer.of(0), state.subarray(0, 32), serialIndex]),
    );
  }
  return state.subarray(0, 32);
}

function edPublic(privateKey) {
  const key = createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), privateKey]),
    format: 'der',
    type: 'pkcs8',
  });
  return createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32);
}

function referenceBase58(bytes) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = integer(bytes);
  let result = '';
  while (value > 0n) {
    result = alphabet[Number(value % 58n)] + result;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = '1' + result;
  }
  return result;
}

function referenceBech32(hashBytes) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const words = [0]; // Witness version 0.
  let accumulator = 0;
  let bits = 0;
  for (const byte of hashBytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >>> bits) & 31);
    }
  }
  if (bits > 0) words.push((accumulator << (5 - bits)) & 31);
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  // HRP expand("bc") followed by data and six zero checksum words.
  for (const word of [3, 3, 0, 2, 3, ...words, 0, 0, 0, 0, 0, 0]) {
    const high = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    generators.forEach((generator, index) => {
      if ((high >>> index) & 1) checksum ^= generator;
    });
  }
  checksum ^= 1;
  const checkWords = Array.from({ length: 6 }, (_, index) => (checksum >>> (5 * (5 - index))) & 31);
  return 'bc1' + [...words, ...checkWords].map((word) => alphabet[word]).join('');
}

function referenceMnemonic(entropy) {
  const bitString = [...entropy].map((byte) => byte.toString(2).padStart(8, '0')).join('');
  const checksum = sha256(entropy)[0].toString(2).padStart(8, '0').slice(0, 4);
  const combined = bitString + checksum;
  return Array.from(
    { length: 12 },
    (_, index) => wordlist[Number.parseInt(combined.slice(index * 11, index * 11 + 11), 2)],
  ).join(' ');
}

async function referenceAddresses(mnemonic, count = 20) {
  const seed = pbkdf2Sync(
    Buffer.from(mnemonic.normalize('NFKD')),
    Buffer.from('mnemonic'),
    2048,
    64,
    'sha512',
  );
  const addresses = { btc: [], eth: [], sol: [], zec: [] };
  for (let index = 0; index < count; index += 1) {
    const btcPath = `m/84'/0'/0'/0/${index}`;
    const ethPath = `m/44'/60'/0'/0/${index}`;
    const solPath = `m/44'/501'/${index}'/0'`;
    const zecPath = `m/44'/133'/0'/0/${index}`;
    addresses.btc.push({
      index,
      path: btcPath,
      address: referenceBech32(hash160(secpPublic(referenceSecpKey(seed, btcPath)))),
    });
    const ethKey = referenceSecpKey(seed, ethPath);
    const lower = (await keccak(secpPublic(ethKey, false).subarray(1), 256)).slice(-40);
    const checksum = await keccak(Buffer.from(lower), 256);
    const ethAddress =
      '0x' +
      [...lower]
        .map((character, offset) =>
          Number.parseInt(checksum[offset], 16) >= 8 ? character.toUpperCase() : character,
        )
        .join('');
    addresses.eth.push({ index, path: ethPath, address: ethAddress });
    addresses.sol.push({
      index,
      path: solPath,
      address: referenceBase58(edPublic(referenceEdKey(seed, solPath))),
    });
    const payload = Buffer.concat([
      Buffer.from('1cb8', 'hex'),
      hash160(secpPublic(referenceSecpKey(seed, zecPath))),
    ]);
    const zecAddress = referenceBase58(
      Buffer.concat([payload, sha256(sha256(payload)).subarray(0, 4)]),
    );
    addresses.zec.push({ index, path: zecPath, address: zecAddress });
  }
  return addresses;
}

// Explicit maintainer-only fixture generation. This derives public test data
// through separate implementations; normal test runs never rewrite fixtures.
if (process.env.BRAINBIP_GENERATE_V2_FIXTURE === '1') {
  const legacy = await fixture('brainbip-v1.json');
  const profile = getProfile('brainbip-v2');
  const passphrase = legacy.passphrase;
  const email = legacy.email;
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
  console.log(`Independent v2 Argon2id reference: ${(performance.now() - started).toFixed(0)} ms`);
  const pbkdfKey = pbkdf2Sync(
    password,
    pbkdfSalt,
    profile.pbkdf2.iterations,
    profile.pbkdf2.outputBytes,
    'sha256',
  );
  const entropy = Buffer.from(argonKey.slice(0, profile.entropyBytes)).map(
    (byte, index) => byte ^ pbkdfKey[index],
  );
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
  console.log('Public v2 independent reference fixture generated; v1 fixtures unchanged.');
} else if (process.env.BRAINBIP_GENERATE_FIXTURES === '1') {
  await mkdir(fixturesDirectory, { recursive: true });
  const standard = {
    provenance:
      'Node/OpenSSL HMAC, PBKDF2, secp256k1 and Ed25519; independent BIP32, SLIP10, Base58 and Bech32 encoders; hash-wasm Keccak.',
    mnemonic: standardMnemonic,
    addresses: await referenceAddresses(standardMnemonic),
  };
  await writeFile(
    new URL('standard-addresses.json', fixturesDirectory),
    JSON.stringify(standard, null, 2) + '\n',
  );
  const passphrase = '  BrainBIP Å test — do not fund  ';
  const email = '  Test.Vector＠Example.invalid  ';
  const password = Buffer.from(passphrase.normalize('NFKC'));
  const normalizedEmail = email.normalize('NFKC').trim();
  const argonSalt = Buffer.concat([
    Buffer.from('BrainBIP/v1/argon2id\0'),
    Buffer.from(normalizedEmail),
  ]);
  const pbkdfSalt = Buffer.concat([
    Buffer.from('BrainBIP/v1/pbkdf2\0'),
    Buffer.from(normalizedEmail),
  ]);
  const started = performance.now();
  const argonKey = await referenceArgon2id(password, argonSalt, {
    m: 262144,
    t: 3,
    p: 1,
    version: 19,
    dkLen: 32,
  });
  console.log(`Independent Argon2id reference: ${(performance.now() - started).toFixed(0)} ms`);
  const pbkdfKey = pbkdf2Sync(password, pbkdfSalt, 1048576, 32, 'sha256');
  const entropy = Buffer.from(argonKey.slice(0, 16)).map((byte, index) => byte ^ pbkdfKey[index]);
  const mnemonic = referenceMnemonic(entropy);
  const production = {
    warning: 'PUBLIC TEST VECTOR. NEVER DEPOSIT FUNDS TO THESE ADDRESSES.',
    provenance:
      'Argon2id: noble-hashes JS implementation, independently checked by the production hash-wasm test; PBKDF2/BIP39 seed and HD/address reference: Node/OpenSSL plus the independent test encoders.',
    profile: 'brainbip-v1',
    passphrase,
    email,
    normalizedPassphrase: passphrase.normalize('NFKC'),
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
    new URL('brainbip-v1.json', fixturesDirectory),
    JSON.stringify(production, null, 2) + '\n',
  );
  console.log('Public reference fixtures generated.');
} else {
  test('profile is fixed and nested parameters are immutable', () => {
    assert.equal(PROFILE.id, 'brainbip-v1');
    assert.deepEqual(PROFILE.argon2id, {
      version: 19,
      memoryKiB: 262144,
      iterations: 3,
      parallelism: 1,
      outputBytes: 32,
      saltPrefix: 'BrainBIP/v1/argon2id\0',
    });
    assert.equal(PROFILE.pbkdf2.iterations, 1048576);
    assert.equal(PROFILE.bip39Passphrase, '');
    for (const value of [PROFILE, PROFILE.argon2id, PROFILE.pbkdf2, PROFILE.paths])
      assert.ok(Object.isFrozen(value));
    assert.throws(() => {
      PROFILE.argon2id.memoryKiB = 8;
    }, TypeError);
  });

  test('v2 is the default fixed profile and shares only unchanged recovery conventions with v1', () => {
    assert.equal(PROFILE, PROFILE_V1);
    assert.equal(DEFAULT_PROFILE_ID, 'brainbip-v2');
    assert.equal(getProfile('brainbip-v1'), PROFILE_V1);
    assert.equal(getProfile(DEFAULT_PROFILE_ID), PROFILE_V2);
    assert.deepEqual(PROFILE_V2.argon2id, {
      version: 19,
      memoryKiB: 524288,
      iterations: 16,
      parallelism: 1,
      outputBytes: 32,
      saltPrefix: 'BrainBIP/v2/argon2id\0',
    });
    assert.deepEqual(PROFILE_V2.pbkdf2, {
      hash: 'SHA-256',
      iterations: 5242880,
      outputBytes: 32,
      saltPrefix: 'BrainBIP/v2/pbkdf2\0',
    });
    for (const name of [
      'maxPassphraseCharacters',
      'maxEmailCharacters',
      'addressCount',
      'entropyBytes',
      'mnemonicWords',
      'bip39Passphrase',
      'paths',
    ]) {
      assert.deepEqual(PROFILE_V2[name], PROFILE_V1[name]);
    }
    for (const value of [
      PROFILES,
      PROFILE_V2,
      PROFILE_V2.argon2id,
      PROFILE_V2.pbkdf2,
      PROFILE_V2.paths,
    ])
      assert.ok(Object.isFrozen(value));
  });

  test('unknown profiles are rejected before any derivation stage without fallback or reflected input', async () => {
    const message = 'Choose a supported derivation profile.';
    for (const id of [
      undefined,
      null,
      '',
      'brainbip-v3',
      'BrainBIP-v2',
      'constructor',
      '__proto__',
      1,
      {},
    ]) {
      assert.throws(() => getProfile(id), { message });
      if (id === undefined) continue; // deriveWallet's omitted argument uses the explicit default.
      const stages = [];
      await assert.rejects(
        deriveWallet('public test only', '', (stage) => stages.push(stage), id),
        { message },
      );
      assert.deepEqual(stages, []);
    }
    assert.equal(safeErrorMessage(new Error(message)), message);
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
    const salt = Buffer.from('BrainBIP/v1/pbkdf2\0User@Example.invalid');
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
    assert.deepEqual(originalChains(deriveAddresses(expected.mnemonic)), expected.addresses);
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

  test('invalid mnemonic/count are rejected and mnemonic whitespace is canonicalized', () => {
    for (const count of [0, -1, 21, 1.5, NaN, '20'])
      assert.throws(() => deriveAddresses(standardMnemonic, count));
    for (const mnemonic of ['', 'abandon '.repeat(12).trim(), null])
      assert.throws(() => deriveAddresses(mnemonic));
    assert.deepEqual(
      deriveAddresses('  ' + standardMnemonic.replaceAll(' ', '\n') + '  ', 1),
      deriveAddresses(standardMnemonic, 1),
    );
  });

  test('worker-facing error text never forwards raw library/input errors', () => {
    const secret = 'private-input-never-forward';
    assert.ok(!safeErrorMessage(new Error(secret)).includes(secret));
    assert.ok(!safeErrorMessage({ message: secret }).includes(secret));
    assert.equal(safeErrorMessage(new Error('Enter a passphrase.')), 'Enter a passphrase.');
  });

  test(
    'fixed v1 production vector uses full costs and matches an independent Argon2id reference',
    { timeout: 120000 },
    async (context) => {
      const expected = await fixture('brainbip-v1.json');
      const stages = [];
      const started = performance.now();
      const actual = await deriveWallet(
        expected.passphrase,
        expected.email,
        (stage) => stages.push(stage),
        'brainbip-v1',
      );
      context.diagnostic(
        `Full 256 MiB Argon2id + 1,048,576 PBKDF2 + 100 addresses: ${(performance.now() - started).toFixed(0)} ms`,
      );
      assert.deepEqual(stages, ['argon2id', 'pbkdf2', 'addresses']);
      assert.deepEqual(
        {
          profile: actual.profile,
          mnemonic: actual.mnemonic,
          addresses: originalChains(actual.addresses),
        },
        { profile: expected.profile, mnemonic: expected.mnemonic, addresses: expected.addresses },
      );
      assert.equal(
        Buffer.from(mnemonicToSeedSync(actual.mnemonic, '')).toString('hex'),
        expected.bip39SeedHex,
      );
      // Verify fixture PBKDF2 and mixing independently without another expensive Argon2 invocation.
      const password = Buffer.from(expected.normalizedPassphrase);
      const pbkdfKey = pbkdf2Sync(
        password,
        Buffer.from(expected.pbkdfSaltHex, 'hex'),
        1048576,
        32,
        'sha256',
      );
      assert.equal(pbkdfKey.toString('hex'), expected.pbkdfKeyHex);
      const entropy = Buffer.from(expected.argonKeyHex, 'hex')
        .subarray(0, 16)
        .map((byte, index) => byte ^ pbkdfKey[index]);
      assert.equal(entropy.toString('hex'), expected.entropyHex);
      assert.equal(referenceMnemonic(entropy), actual.mnemonic);
    },
  );

  test(
    'default v2 uses full fixed costs and matches independent Argon2id/OpenSSL reference data',
    { timeout: 120000 },
    async (context) => {
      const expected = await fixture('brainbip-v2.json');
      const legacy = await fixture('brainbip-v1.json');
      const stages = [];
      const started = performance.now();
      const actual = await deriveWallet(expected.passphrase, expected.email, (stage) =>
        stages.push(stage),
      );
      context.diagnostic(
        `Full v2 512 MiB/t16 Argon2id + 5,242,880 PBKDF2 + 100 addresses: ${(performance.now() - started).toFixed(0)} ms`,
      );
      assert.deepEqual(stages, ['argon2id', 'pbkdf2', 'addresses']);
      assert.deepEqual(
        {
          profile: actual.profile,
          mnemonic: actual.mnemonic,
          addresses: originalChains(actual.addresses),
        },
        { profile: 'brainbip-v2', mnemonic: expected.mnemonic, addresses: expected.addresses },
      );
      assert.notEqual(actual.mnemonic, legacy.mnemonic);
      assert.equal(
        Buffer.from(mnemonicToSeedSync(actual.mnemonic, '')).toString('hex'),
        expected.bip39SeedHex,
      );
      assert.deepEqual(await referenceAddresses(actual.mnemonic), expected.addresses);
      assert.equal(actual.addresses.xmr.length, 20);
      assert.equal(actual.recovery.xmr.mnemonic.split(' ').length, 25);
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
      const entropy = Buffer.from(argonKey.slice(0, 16)).map(
        (byte, index) => byte ^ pbkdfKey[index],
      );
      assert.equal(entropy.toString('hex'), expected.entropyHex);
      assert.equal(referenceMnemonic(entropy), actual.mnemonic);
      for (const bytes of [password, argonSalt, pbkdfSalt, argonKey, pbkdfKey, entropy])
        bytes.fill(0);
    },
  );
}
