import { argon2id, createSHA256, pbkdf2 } from 'hash-wasm';
import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes } from '@noble/hashes/utils.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { entropyToMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';
import { base58, base58check, bech32 } from '@scure/base';
import Slip10 from 'micro-key-producer/slip10.js';
import { isUnicodeText, normalizeInputText } from './inputs.js';
import { PROFILE } from './profiles.js';

export { PROFILE };

const encoder = new TextEncoder();
const INPUT_ERROR_MESSAGES = new Set([
  'Passphrase and email must be text.',
  'Enter a passphrase.',
  'Passphrase must contain at most 1024 characters and email at most 320 characters after normalization.',
  'Passphrase and email must contain valid Unicode text.',
  'Enter a valid 12-word English BIP39 phrase.',
  'Address count must be an integer from 1 to 20.',
]);

// Only our fixed validation messages can leave the worker. Library errors may
// include inputs or internal state, so their messages are never forwarded.
export function safeErrorMessage(error) {
  if (error instanceof Error && INPUT_ERROR_MESSAGES.has(error.message)) return error.message;
  return 'Wallet generation failed. WebAssembly support and enough available memory are required.';
}

export function normalizeInputs(passphrase, email = '') {
  if (typeof passphrase !== 'string' || typeof email !== 'string') {
    throw new TypeError('Passphrase and email must be text.');
  }
  if (!isUnicodeText(passphrase) || !isUnicodeText(email)) {
    throw new TypeError('Passphrase and email must contain valid Unicode text.');
  }
  const { passphrase: normalizedPassphrase, email: normalizedEmail } = normalizeInputText(
    passphrase,
    email,
  );
  if (normalizedPassphrase.length === 0) throw new Error('Enter a passphrase.');
  if (
    [...normalizedPassphrase].length > PROFILE.maxPassphraseCharacters ||
    [...normalizedEmail].length > PROFILE.maxEmailCharacters
  ) {
    throw new RangeError(
      'Passphrase must contain at most 1024 characters and email at most 320 characters after normalization.',
    );
  }
  return { passphrase: normalizedPassphrase, email: normalizedEmail };
}

function ethAddress(privateKey) {
  const publicKey = secp256k1.getPublicKey(privateKey, false);
  const hash = keccak_256(publicKey.subarray(1));
  const lower = bytesToHex(hash.subarray(12));
  const checksum = bytesToHex(keccak_256(encoder.encode(lower)));
  const address =
    '0x' +
    [...lower]
      .map((character, index) =>
        Number.parseInt(checksum[index], 16) >= 8 ? character.toUpperCase() : character,
      )
      .join('');
  publicKey.fill(0);
  hash.fill(0);
  return address;
}

function btcAddress(publicKey) {
  const hash = ripemd160(sha256(publicKey));
  const address = bech32.encode('bc', [0, ...bech32.toWords(hash)]);
  hash.fill(0);
  return address;
}

const zcashBase58check = base58check(sha256);
function zecAddress(publicKey) {
  const hash = ripemd160(sha256(publicKey));
  // Zcash mainnet transparent P2PKH uses the two-byte 0x1c,0xb8 prefix.
  const payload = concatBytes(Uint8Array.of(0x1c, 0xb8), hash);
  const address = zcashBase58check.encode(payload);
  hash.fill(0);
  payload.fill(0);
  return address;
}

function wipeEdNode(node) {
  node.privateKey.fill(0);
  node.chainCode?.fill(0);
}

function derivePath(root, path, wipeNode) {
  let node = root;
  try {
    for (const component of path.split('/').slice(1)) {
      const hardened = component.endsWith("'");
      const index = Number.parseInt(component, 10) + (hardened ? 0x80000000 : 0);
      const child = node.deriveChild(index);
      if (node !== root) wipeNode(node);
      node = child;
    }
    return node;
  } catch (error) {
    if (node !== root) wipeNode(node);
    throw error;
  }
}

export function deriveAddresses(mnemonic, count = PROFILE.addressCount) {
  if (!Number.isInteger(count) || count < 1 || count > PROFILE.addressCount) {
    throw new RangeError('Address count must be an integer from 1 to 20.');
  }
  if (typeof mnemonic !== 'string')
    throw new TypeError('Enter a valid 12-word English BIP39 phrase.');
  const canonicalMnemonic = mnemonic.normalize('NFKD').trim().split(/\s+/u).join(' ');
  if (
    canonicalMnemonic.split(' ').length !== PROFILE.mnemonicWords ||
    !validateMnemonic(canonicalMnemonic, wordlist)
  ) {
    throw new Error('Enter a valid 12-word English BIP39 phrase.');
  }
  const seed = mnemonicToSeedSync(canonicalMnemonic, PROFILE.bip39Passphrase);
  let secpRoot;
  let edRoot;
  const addresses = { btc: [], eth: [], sol: [], zec: [] };
  try {
    secpRoot = HDKey.fromMasterSeed(seed);
    edRoot = Slip10.fromMasterSeed(seed);
    for (let index = 0; index < count; index += 1) {
      for (const chain of ['btc', 'eth', 'zec']) {
        const path = PROFILE.paths[chain].replace('{index}', String(index));
        const child = derivePath(secpRoot, path, (node) => node.wipePrivateData());
        const privateKey = child.privateKey;
        const publicKey = child.publicKey;
        try {
          const address =
            chain === 'btc'
              ? btcAddress(publicKey)
              : chain === 'eth'
                ? ethAddress(privateKey)
                : zecAddress(publicKey);
          addresses[chain].push({ index, path, address });
        } finally {
          privateKey?.fill(0);
          publicKey?.fill(0);
          child.wipePrivateData();
        }
      }
      const path = PROFILE.paths.sol.replace('{index}', String(index));
      const child = derivePath(edRoot, path, wipeEdNode);
      const publicKey = child.publicKeyRaw;
      try {
        addresses.sol.push({ index, path, address: base58.encode(publicKey) });
      } finally {
        publicKey.fill(0);
        wipeEdNode(child);
      }
    }
    return addresses;
  } finally {
    seed.fill(0);
    secpRoot?.wipePrivateData();
    if (edRoot) wipeEdNode(edRoot);
  }
}

export async function deriveWallet(passphrase, email = '', onStage = () => {}) {
  const normalized = normalizeInputs(passphrase, email);
  const password = encoder.encode(normalized.passphrase);
  const emailBytes = encoder.encode(normalized.email);
  const argonSalt = concatBytes(encoder.encode(PROFILE.argon2id.saltPrefix), emailBytes);
  const pbkdfSalt = concatBytes(encoder.encode(PROFILE.pbkdf2.saltPrefix), emailBytes);
  let argonKey;
  let pbkdfKey;
  let mixed;
  let entropy;
  try {
    onStage('argon2id');
    argonKey = await argon2id({
      password,
      salt: argonSalt,
      memorySize: PROFILE.argon2id.memoryKiB,
      iterations: PROFILE.argon2id.iterations,
      parallelism: PROFILE.argon2id.parallelism,
      hashLength: PROFILE.argon2id.outputBytes,
      outputType: 'binary',
    });
    onStage('pbkdf2');
    pbkdfKey = await pbkdf2({
      password,
      salt: pbkdfSalt,
      iterations: PROFILE.pbkdf2.iterations,
      hashLength: PROFILE.pbkdf2.outputBytes,
      hashFunction: createSHA256(),
      outputType: 'binary',
    });
    mixed = new Uint8Array(PROFILE.argon2id.outputBytes);
    for (let index = 0; index < mixed.length; index += 1)
      mixed[index] = argonKey[index] ^ pbkdfKey[index];
    entropy = mixed.slice(0, PROFILE.entropyBytes);
    const mnemonic = entropyToMnemonic(entropy, wordlist);
    onStage('addresses');
    return { mnemonic, addresses: deriveAddresses(mnemonic), profile: PROFILE.id };
  } finally {
    for (const buffer of [
      password,
      emailBytes,
      argonSalt,
      pbkdfSalt,
      argonKey,
      pbkdfKey,
      mixed,
      entropy,
    ]) {
      buffer?.fill(0);
    }
  }
}
