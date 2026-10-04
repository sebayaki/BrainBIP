// Recovery profiles are fixed protocol values. This module intentionally has
// no dependencies so the interface can select a version without loading KDFs.
const common = Object.freeze({
  maxPassphraseCharacters: 1024,
  maxEmailCharacters: 320,
  addressCount: 20,
  entropyBytes: 16,
  mnemonicWords: 12,
  bip39Passphrase: '',
  paths: Object.freeze({
    btc: "m/84'/0'/0'/0/{index}",
    eth: "m/44'/60'/0'/0/{index}",
    sol: "m/44'/501'/{index}'/0'",
    zec: "m/44'/133'/0'/0/{index}",
    xmr: "m/44'/128'/0'/0/0",
  }),
});

export const PROFILE_V1 = Object.freeze({
  id: 'brainbip-v1',
  ...common,
  argon2id: Object.freeze({
    version: 19,
    memoryKiB: 262144,
    iterations: 3,
    parallelism: 1,
    outputBytes: 32,
    saltPrefix: 'BrainBIP/v1/argon2id\0',
  }),
  pbkdf2: Object.freeze({
    hash: 'SHA-256',
    iterations: 1048576,
    outputBytes: 32,
    saltPrefix: 'BrainBIP/v1/pbkdf2\0',
  }),
});

export const PROFILE_V2 = Object.freeze({
  id: 'brainbip-v2',
  ...common,
  argon2id: Object.freeze({
    version: 19,
    memoryKiB: 524288,
    iterations: 16,
    parallelism: 1,
    outputBytes: 32,
    saltPrefix: 'BrainBIP/v2/argon2id\0',
  }),
  pbkdf2: Object.freeze({
    hash: 'SHA-256',
    iterations: 5242880,
    outputBytes: 32,
    saltPrefix: 'BrainBIP/v2/pbkdf2\0',
  }),
});

export const PROFILES = Object.freeze({
  [PROFILE_V1.id]: PROFILE_V1,
  [PROFILE_V2.id]: PROFILE_V2,
});
export const DEFAULT_PROFILE_ID = PROFILE_V2.id;

export function getProfile(id) {
  if (typeof id !== 'string' || !Object.hasOwn(PROFILES, id)) {
    throw new Error('Choose a supported derivation profile.');
  }
  return PROFILES[id];
}
