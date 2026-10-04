import {
  createHash,
  createHmac,
  createECDH,
  createPrivateKey,
  createPublicKey,
  pbkdf2Sync,
} from 'node:crypto';
import { keccak } from 'hash-wasm';
import { wordlist } from '@scure/bip39/wordlists/english.js';

// Independent address reference: Node/OpenSSL provides the cryptographic
// primitives; the HD, Base58, Bech32 and script encoders below do not import
// production code or the production noble/scure HD and address implementations.
const hash = (algorithm, data) => createHash(algorithm).update(data).digest();
const sha256 = (data) => hash('sha256', data);
const hash160 = (data) => hash('ripemd160', sha256(data));
const hmac512 = (key, data) => createHmac('sha512', key).update(data).digest();
const curveOrder = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
const integer = (bytes) => BigInt('0x' + bytes.toString('hex'));
const serialize256 = (value) => Buffer.from(value.toString(16).padStart(64, '0'), 'hex');

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
    if (tweak >= curveOrder) throw new Error('Invalid reference BIP32 child');
    const child = (integer(privateKey) + tweak) % curveOrder;
    if (child === 0n) throw new Error('Invalid reference BIP32 child');
    privateKey = serialize256(child);
    chainCode = state.subarray(32);
  }
  return privateKey;
}

function referenceEdKey(seed, path) {
  let state = hmac512('ed25519 seed', seed);
  for (const component of path.split('/').slice(1)) {
    if (!component.endsWith("'")) throw new Error('Ed25519 reference path must be hardened');
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

function referenceBase58check(payload) {
  return referenceBase58(Buffer.concat([payload, sha256(sha256(payload)).subarray(0, 4)]));
}

function referenceBech32(hashBytes) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const words = [0];
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

export function referenceMnemonic(entropy) {
  const bitString = [...entropy].map((byte) => byte.toString(2).padStart(8, '0')).join('');
  const checksum = sha256(entropy)[0].toString(2).padStart(8, '0').slice(0, 4);
  const combined = bitString + checksum;
  return Array.from(
    { length: 12 },
    (_, index) => wordlist[Number.parseInt(combined.slice(index * 11, index * 11 + 11), 2)],
  ).join(' ');
}

export async function referenceChainAddresses(mnemonic, chain, template, addressType, count = 20) {
  const seed = pbkdf2Sync(
    Buffer.from(mnemonic.normalize('NFKD')),
    Buffer.from('mnemonic'),
    2048,
    64,
    'sha512',
  );
  const rows = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const path = template.replace('{index}', String(index));
      let address;
      if (chain === 'sol') {
        address = referenceBase58(edPublic(referenceEdKey(seed, path)));
      } else {
        const privateKey = referenceSecpKey(seed, path);
        if (chain === 'eth') {
          const lower = (await keccak(secpPublic(privateKey, false).subarray(1), 256)).slice(-40);
          const checksum = await keccak(Buffer.from(lower), 256);
          address =
            '0x' +
            [...lower]
              .map((character, offset) =>
                Number.parseInt(checksum[offset], 16) >= 8 ? character.toUpperCase() : character,
              )
              .join('');
        } else {
          const keyHash = hash160(secpPublic(privateKey));
          if (chain === 'zec') {
            address = referenceBase58check(Buffer.concat([Buffer.from('1cb8', 'hex'), keyHash]));
          } else if (addressType === 'native') {
            address = referenceBech32(keyHash);
          } else if (addressType === 'nested') {
            const scriptHash = hash160(Buffer.concat([Buffer.from('0014', 'hex'), keyHash]));
            address = referenceBase58check(Buffer.concat([Buffer.of(5), scriptHash]));
          } else if (addressType === 'legacy') {
            address = referenceBase58check(Buffer.concat([Buffer.of(0), keyHash]));
          } else {
            throw new Error('Unknown reference address type');
          }
        }
        privateKey.fill(0);
      }
      rows.push({ index, path, address });
    }
    return rows;
  } finally {
    seed.fill(0);
  }
}

export async function referenceAddresses(mnemonic, count = 20) {
  return {
    btc: await referenceChainAddresses(mnemonic, 'btc', "m/84'/0'/0'/0/{index}", 'native', count),
    eth: await referenceChainAddresses(mnemonic, 'eth', "m/44'/60'/0'/0/{index}", undefined, count),
    sol: await referenceChainAddresses(mnemonic, 'sol', "m/44'/501'/{index}'/0'", undefined, count),
    zec: await referenceChainAddresses(
      mnemonic,
      'zec',
      "m/44'/133'/0'/0/{index}",
      undefined,
      count,
    ),
  };
}
