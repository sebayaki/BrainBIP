import { readFile, writeFile } from 'node:fs/promises';
import { pbkdf2Sync } from 'node:crypto';
import { referenceAddresses, referenceMnemonic } from './lib/addresses-reference.js';

if (process.argv.length !== 3 || process.argv[2] !== '--write') {
  throw new Error('Use --write to regenerate the public 24-word reference fixture.');
}
const sourceFixture = 'brainbip-v2.json';
const source = JSON.parse(
  await readFile(new URL('./fixtures/' + sourceFixture, import.meta.url), 'utf8'),
);
const pbkdfKey = Buffer.from(source.pbkdfKeyHex, 'hex');
const entropy = Buffer.from(source.argonKeyHex, 'hex').map((byte, index) => byte ^ pbkdfKey[index]);
const mnemonic = referenceMnemonic(entropy);
const fixture = {
  warning: 'PUBLIC TEST VECTOR. NEVER DEPOSIT FUNDS TO THESE ADDRESSES.',
  provenance:
    'Full 32-byte XOR of the independently verified public Argon2id and PBKDF2 outputs in the source fixture; independent BIP39 bit/checksum encoding, Node/OpenSSL seed and HD/address reference implementations.',
  sourceFixture,
  profile: source.profile,
  wordCount: 24,
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
  new URL('./fixtures/brainbip-24.json', import.meta.url),
  JSON.stringify(fixture, null, 2) + '\n',
);
entropy.fill(0);
pbkdfKey.fill(0);
console.log('Generated the public 24-word reference and 80 addresses without repeating the KDF.');
