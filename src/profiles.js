// One fixed recovery specification. No dependencies are needed to display
// the current cost parameters in the interface.
export const PROFILE = Object.freeze({
  id: 'brainbip-v2',
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
  }),
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
