import { readFile, writeFile } from 'node:fs/promises';
import { referenceChainAddresses } from './lib/addresses-reference.js';

// Explicit generation only. Normal tests read this public fixture unchanged.
if (process.argv.length !== 3 || process.argv[2] !== '--write') {
  throw new Error('Use --write to regenerate the public address preset reference fixture.');
}

const { mnemonic } = JSON.parse(
  await readFile(new URL('./fixtures/brainbip-v2.json', import.meta.url), 'utf8'),
);
const definitions = [
  ['btc', 'standard', "m/84'/0'/0'/0/{index}", 'native'],
  ['btc', 'nested-segwit', "m/49'/0'/0'/0/{index}", 'nested'],
  ['btc', 'legacy', "m/44'/0'/0'/0/{index}", 'legacy'],
  ['eth', 'standard', "m/44'/60'/0'/0/{index}"],
  ['eth', 'ledger-legacy', "m/44'/60'/0'/{index}"],
  ['eth', 'ledger-live', "m/44'/60'/{index}'/0/0"],
  ['sol', 'standard', "m/44'/501'/{index}'/0'"],
  ['sol', 'bip44', "m/44'/501'/{index}'"],
  ['zec', 'standard', "m/44'/133'/0'/0/{index}"],
  ['btc', 'custom', "m/84'/0'/2'/0/{index}", 'native'],
  ['eth', 'custom', "m/44'/60'/7'/0/{index}"],
  ['sol', 'custom', "m/44'/501'/7'/{index}'"],
  ['zec', 'custom', "m/44'/133'/2'/0/{index}"],
];
const vectors = [];
for (const [chain, presetId, path, addressType] of definitions) {
  const selection =
    presetId === 'custom'
      ? { presetId, customPath: path, ...(addressType ? { addressType } : {}) }
      : { presetId };
  vectors.push({
    chain,
    selection,
    rows: await referenceChainAddresses(mnemonic, chain, path, addressType),
  });
}
const fixture = {
  warning: 'PUBLIC TEST VECTOR. NEVER DEPOSIT FUNDS TO THESE ADDRESSES.',
  provenance:
    'Node/OpenSSL BIP39 seed, HMAC, secp256k1 and Ed25519; independent BIP32, SLIP10, Base58Check, Bech32 and P2SH-P2WPKH encoders; hash-wasm Keccak. No production derivation or preset code is imported.',
  mnemonic,
  vectors,
};
await writeFile(
  new URL('./fixtures/address-presets.json', import.meta.url),
  JSON.stringify(fixture, null, 2) + '\n',
);
console.log(`Generated ${vectors.length} public vectors and ${vectors.length * 20} addresses.`);
