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
import { DERIVATION_ERROR_MESSAGES, resolveDerivation } from './derivation-paths.js';

export { PROFILE };

const encoder = new TextEncoder();
const INPUT_ERROR_MESSAGES = new Set([
  'Passphrase and email must be text.',
  'Enter a passphrase.',
  'Passphrase must contain at most 1024 characters and email at most 320 characters after normalization.',
  'Passphrase and email must contain valid Unicode text.',
  'Enter a valid 12-word English BIP39 phrase.',
  'Address count must be an integer from 1 to 20.',
  ...Object.values(DERIVATION_ERROR_MESSAGES),
]);

// Only our fixed validation messages can leave the worker. Library errors may
// include inputs or internal state, so their messages are never forwarded.
function fixedErrorMessage(error, fallback) {
  if (error instanceof Error && INPUT_ERROR_MESSAGES.has(error.message)) return error.message;
  return fallback;
}

export function safeErrorMessage(error) {
  return fixedErrorMessage(
    error,
    'Wallet generation failed. WebAssembly support and enough available memory are required.',
  );
}

export function safeAddressErrorMessage(error) {
  return fixedErrorMessage(error, 'Address calculation failed. Try another derivation path.');
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

const bitcoinBase58check = base58check(sha256);
function btcAddress(publicKey, addressType) {
  const hash = ripemd160(sha256(publicKey));
  let redeemScript;
  let scriptHash;
  let payload;
  try {
    if (addressType === 'native') return bech32.encode('bc', [0, ...bech32.toWords(hash)]);
    if (addressType === 'nested') {
      // P2SH-P2WPKH: HASH160 of the v0 witness program 0x00 0x14 <key hash>.
      redeemScript = concatBytes(Uint8Array.of(0, 20), hash);
      scriptHash = ripemd160(sha256(redeemScript));
      payload = concatBytes(Uint8Array.of(0x05), scriptHash);
    } else {
      // Mainnet P2PKH uses the one-byte 0x00 prefix.
      payload = concatBytes(Uint8Array.of(0), hash);
    }
    return bitcoinBase58check.encode(payload);
  } finally {
    for (const bytes of [hash, redeemScript, scriptHash, payload]) bytes?.fill(0);
  }
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

function deriveComponents(root, components, wipeNode) {
  let node = root;
  try {
    for (const component of components) {
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

function validateAddressCount(count) {
  if (!Number.isInteger(count) || count < 1 || count > PROFILE.addressCount) {
    throw new RangeError('Address count must be an integer from 1 to 20.');
  }
}

function canonicalizeMnemonic(mnemonic) {
  if (typeof mnemonic !== 'string')
    throw new TypeError('Enter a valid 12-word English BIP39 phrase.');
  const canonicalMnemonic = mnemonic.normalize('NFKD').trim().split(/\s+/u).join(' ');
  if (
    canonicalMnemonic.split(' ').length !== PROFILE.mnemonicWords ||
    !validateMnemonic(canonicalMnemonic, wordlist)
  ) {
    throw new Error('Enter a valid 12-word English BIP39 phrase.');
  }
  return canonicalMnemonic;
}

function deriveRows(root, chain, derivation, count) {
  const components = derivation.path.split('/').slice(1);
  const indexPosition = components.findIndex((component) => component.startsWith('{index}'));
  const wipeNode = chain === 'sol' ? wipeEdNode : (node) => node.wipePrivateData();
  const prefix = deriveComponents(root, components.slice(0, indexPosition), wipeNode);
  const suffix = components.slice(indexPosition);
  const rows = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const path = derivation.path.replace('{index}', String(index));
      const child = deriveComponents(
        prefix,
        suffix.map((component) => component.replace('{index}', String(index))),
        wipeNode,
      );
      let privateKey;
      let publicKey;
      try {
        if (chain === 'sol') {
          publicKey = child.publicKeyRaw;
          rows.push({ index, path, address: base58.encode(publicKey) });
        } else {
          privateKey = child.privateKey;
          publicKey = child.publicKey;
          const address =
            chain === 'btc'
              ? btcAddress(publicKey, derivation.addressType)
              : chain === 'eth'
                ? ethAddress(privateKey)
                : zecAddress(publicKey);
          rows.push({ index, path, address });
        }
      } finally {
        privateKey?.fill(0);
        publicKey?.fill(0);
        wipeNode(child);
      }
    }
    return rows;
  } finally {
    if (prefix !== root) wipeNode(prefix);
  }
}

function deriveAddressGroups(mnemonic, derivations, count) {
  const canonicalMnemonic = canonicalizeMnemonic(mnemonic);
  const seed = mnemonicToSeedSync(canonicalMnemonic, PROFILE.bip39Passphrase);
  let secpRoot;
  let edRoot;
  const addresses = {};
  try {
    for (const [chain, derivation] of Object.entries(derivations)) {
      let root;
      if (chain === 'sol') {
        edRoot ??= Slip10.fromMasterSeed(seed);
        root = edRoot;
      } else {
        secpRoot ??= HDKey.fromMasterSeed(seed);
        root = secpRoot;
      }
      addresses[chain] = deriveRows(root, chain, derivation, count);
    }
    return addresses;
  } finally {
    seed.fill(0);
    secpRoot?.wipePrivateData();
    if (edRoot) wipeEdNode(edRoot);
  }
}

export function deriveAddresses(mnemonic, count = PROFILE.addressCount) {
  validateAddressCount(count);
  const derivations = Object.fromEntries(
    ['btc', 'eth', 'sol', 'zec'].map((chain) => [chain, resolveDerivation(chain)]),
  );
  return deriveAddressGroups(mnemonic, derivations, count);
}

export function deriveChainAddresses(mnemonic, chain, selection, count = PROFILE.addressCount) {
  const derivation = resolveDerivation(chain, selection);
  validateAddressCount(count);
  return deriveAddressGroups(mnemonic, { [chain]: derivation }, count)[chain];
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
