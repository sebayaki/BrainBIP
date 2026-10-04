import { keccak_256 } from '@noble/hashes/sha3.js';
import { concatBytes } from '@noble/hashes/utils.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { HDKey } from '@scure/bip32';
import { base58xmr } from '@scure/base';
import { moneroEnglish } from './monero-english.js';

export const MONERO_PROFILE = Object.freeze({
  mapping: 'ledger-bip39-v1',
  path: "m/44'/128'/0'/0/0",
  account: 0,
  addressCount: 20,
  primaryPrefix: 18,
  subaddressPrefix: 42,
  recoveryWords: 25,
});

const encoder = new TextEncoder();
const subaddressDomain = encoder.encode('SubAddr\0');
const scalarOrder = ed25519.Point.Fn.ORDER;

function numberLE(bytes) {
  let number = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    number = (number << 8n) | BigInt(bytes[index]);
  }
  return number;
}

function scalarBytes(number) {
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number(number & 255n);
    number >>= 8n;
  }
  return bytes;
}

function hashScalar(bytes) {
  const hash = keccak_256(bytes);
  try {
    // Monero sc_reduce32 interprets its input in little-endian order.
    return numberLE(hash) % scalarOrder;
  } finally {
    hash.fill(0);
  }
}

function countCheck(count) {
  if (!Number.isInteger(count) || count < 1 || count > MONERO_PROFILE.addressCount) {
    throw new RangeError('Address count must be an integer from 1 to 20.');
  }
}

function checkedSpendKey(spendKey) {
  if (!(spendKey instanceof Uint8Array) || spendKey.length !== 32) {
    throw new TypeError('Monero spend key must be 32 bytes.');
  }
  const scalar = numberLE(spendKey);
  if (scalar <= 0n || scalar >= scalarOrder) throw new Error('Monero spend key must be a canonical nonzero scalar.');
  return scalar;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Standard Monero English legacy mnemonic: 32-byte reduced spend key,
// eight little-endian uint32 values, 24 words plus their CRC32 checksum word.
// https://github.com/monero-project/monero/blob/master/src/mnemonics/electrum-words.cpp
export function moneroMnemonicFromSpendKey(spendKey) {
  checkedSpendKey(spendKey);
  const words = [];
  const view = new DataView(spendKey.buffer, spendKey.byteOffset, spendKey.byteLength);
  const count = moneroEnglish.length;
  for (let offset = 0; offset < spendKey.length; offset += 4) {
    const value = view.getUint32(offset, true);
    const first = value % count;
    const second = (Math.floor(value / count) + first) % count;
    const third = (Math.floor(Math.floor(value / count) / count) + second) % count;
    words.push(moneroEnglish[first], moneroEnglish[second], moneroEnglish[third]);
  }
  const prefixes = encoder.encode(words.map((word) => word.slice(0, 3)).join(''));
  const checksumIndex = crc32(prefixes) % words.length;
  prefixes.fill(0);
  return [...words, words[checksumIndex]].join(' ');
}

function addressFor(spendPublic, viewPublic, prefix) {
  const spendBytes = spendPublic.toBytes();
  const viewBytes = viewPublic.toBytes();
  const payload = concatBytes(Uint8Array.of(prefix), spendBytes, viewBytes);
  const checksum = keccak_256(payload);
  const encoded = concatBytes(payload, checksum.subarray(0, 4));
  try {
    // Monero uses fixed-width Base58 blocks, not Bitcoin Base58Check.
    return base58xmr.encode(encoded);
  } finally {
    for (const bytes of [spendBytes, viewBytes, payload, checksum, encoded]) bytes.fill(0);
  }
}

// This helper also supports tests against published native Monero spend keys.
// It exposes only addresses and does not return any private scalar.
export function moneroAddressesFromSpendKey(spendKey, count = MONERO_PROFILE.addressCount) {
  countCheck(count);
  const spend = checkedSpendKey(spendKey);
  const view = hashScalar(spendKey);
  if (view === 0n) throw new Error('Monero derivation produced an invalid scalar.');
  // These are raw scalar multiplications. Ed25519 getPublicKey(seed) instead
  // applies EdDSA hashing/clamping and would generate a different wallet.
  const spendPublic = ed25519.Point.BASE.multiply(spend);
  const viewPublic = ed25519.Point.BASE.multiply(view);
  const viewBytes = scalarBytes(view);
  const addresses = [];
  try {
    for (let index = 0; index < count; index += 1) {
      let address;
      if (index === 0) {
        address = addressFor(spendPublic, viewPublic, MONERO_PROFILE.primaryPrefix);
      } else {
        const indices = new Uint8Array(8);
        const indicesView = new DataView(indices.buffer);
        indicesView.setUint32(0, MONERO_PROFILE.account, true);
        indicesView.setUint32(4, index, true);
        const material = concatBytes(subaddressDomain, viewBytes, indices);
        try {
          const tweak = hashScalar(material);
          const tweakPublic = tweak === 0n ? ed25519.Point.ZERO : ed25519.Point.BASE.multiply(tweak);
          const subSpendPublic = spendPublic.add(tweakPublic);
          const subViewPublic = subSpendPublic.multiply(view);
          address = addressFor(subSpendPublic, subViewPublic, MONERO_PROFILE.subaddressPrefix);
        } finally {
          material.fill(0);
          indices.fill(0);
        }
      }
      addresses.push({ index, path: MONERO_PROFILE.path, address, account: MONERO_PROFILE.account, subaddress: index });
    }
    return addresses;
  } finally {
    viewBytes.fill(0);
  }
}

function ledgerChild(seed) {
  let node = HDKey.fromMasterSeed(seed);
  try {
    for (const index of [0x8000002c, 0x80000080, 0x80000000, 0, 0]) {
      const child = node.deriveChild(index);
      node.wipePrivateData();
      node = child;
    }
    return node;
  } catch (error) {
    node.wipePrivateData();
    throw error;
  }
}

// Frozen Ledger-compatible mapping. The input is the BIP39 64-byte seed,
// with an empty extra BIP39 passphrase in BrainBIP. Trezor uses a different
// Monero mapping; native Monero wallets restore through the 25-word phrase.
// https://github.com/LedgerHQ/app-monero/blob/develop/src/monero_init.c
export function deriveMoneroWallet(seed, count = MONERO_PROFILE.addressCount) {
  countCheck(count);
  if (!(seed instanceof Uint8Array) || seed.length !== 64) {
    throw new TypeError('Monero derivation requires a 64-byte BIP39 seed.');
  }
  let child;
  let childPrivate;
  let spendKey;
  try {
    child = ledgerChild(seed);
    childPrivate = child.privateKey;
    const spend = hashScalar(childPrivate);
    if (spend === 0n) throw new Error('Monero derivation produced an invalid scalar.');
    spendKey = scalarBytes(spend);
    return {
      addresses: moneroAddressesFromSpendKey(spendKey, count),
      recovery: {
        mnemonic: moneroMnemonicFromSpendKey(spendKey),
        mapping: MONERO_PROFILE.mapping,
        path: MONERO_PROFILE.path,
      },
    };
  } finally {
    childPrivate?.fill(0);
    spendKey?.fill(0);
    child?.wipePrivateData();
  }
}
