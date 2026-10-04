![BrainBIP — A passphrase. Twelve words. Five chains.](assets/banner.svg)

<p align="center">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-2f6b45"></a>
  <a href="docs/security.md"><img alt="Experimental" src="https://img.shields.io/badge/status-experimental-b88646"></a>
  <a href="https://github.com/sebayaki/BrainBIP/actions/workflows/ci.yml"><img alt="Check" src="https://github.com/sebayaki/BrainBIP/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/sebayaki/BrainBIP/releases"><img alt="Application version" src="https://img.shields.io/github/package-json/v/sebayaki/BrainBIP?color=697167"></a>
</p>

<p align="center">
  <a href="https://sebayaki.github.io/BrainBIP/">Demo ↗</a> ·
  <a href="https://sebayaki.github.io/BrainBIP/brainbip.html">Offline edition</a> ·
  <a href="https://github.com/sebayaki/BrainBIP/releases">Releases</a> ·
  <a href="docs/derivation.md">Derivation</a> ·
  <a href="docs/security.md">Security</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

BrainBIP turns a **passphrase + optional email salt** into twelve BIP39 recovery words and twenty receiving addresses each for Bitcoin, Ethereum, Solana, Zcash, and Monero.

The interface, cryptographic code, dictionaries, fonts, and WebAssembly fit in **one HTML file**. Everything runs on your device, including strength estimates. No server, CDN, RPC, analytics, or runtime downloads are required.

> **Experimental and unaudited.** Argon2id and PBKDF2 make guessing more expensive; they cannot give a predictable passphrase the security of randomly generated recovery words. Read the [security model](docs/security.md) before using the tool.

## Use BrainBIP

1. Open the [demo](https://sebayaki.github.io/BrainBIP/) or download the [offline edition](https://sebayaki.github.io/BrainBIP/brainbip.html). The demo's **Offline edition** button saves the complete app; open that file locally to work without a connection.
2. Enter a passphrase and, optionally, an email salt. Select **Generate recovery phrase**.
3. Reveal the twelve words and browse the five address tabs. The Monero tab also provides its own 25-word recovery phrase.
4. Select **Clear & reset** to discard inputs and results. Your system clipboard is not cleared.

Use [Releases](https://github.com/sebayaki/BrainBIP/releases) for versioned downloads. The hosted demo follows `main`. Verify downloads against their accompanying `SHA256SUMS.txt`; the hosted checksum file is [available here](https://sebayaki.github.io/BrainBIP/SHA256SUMS.txt).

The app requires a modern browser with WebAssembly and Web Workers, plus **256 MiB of derivation memory and browser overhead**. It never lowers the computation cost automatically.

## What it does

- **Deterministic recovery:** the same normalized inputs and fixed derivation mappings reproduce the same wallet.
- **One hundred addresses:** twenty per chain, with derivation paths and Monero subaddress indexes.
- **Explicit secret controls:** reveal, hide, copy, cancel, and reset.
- **Local guesswork estimates:** dictionary-aware feedback; the private-email switch starts **OFF** and changes the estimate only.
- **Portable offline use:** an embedded build with checksums and third-party notices.

## Recovery and compatibility

The generated English BIP39 phrase uses an **empty additional BIP39 passphrase**. Your original BrainBIP passphrase is already used to derive the words; do not enter it again as another wallet's additional passphrase.

| Chain    | Receiving addresses                   | Mapping, `i = 0…19`                                     |
| -------- | ------------------------------------- | ------------------------------------------------------- |
| Bitcoin  | Native SegWit, `bc1q…`                | `m/84'/0'/0'/0/i`                                       |
| Ethereum | EIP-55 checksummed                    | `m/44'/60'/0'/0/i`                                      |
| Solana   | Ed25519, Base58                       | `m/44'/501'/i'/0'`                                      |
| Zcash    | Transparent P2PKH, `t1…`              | `m/44'/133'/0'/0/i`                                     |
| Monero   | One primary address + 19 subaddresses | Ledger `m/44'/128'/0'/0/0`; account `0`, subaddress `i` |

**Monero needs its separate 25-word legacy recovery phrase for standard Monero seed import.** The twelve BIP39 words are not directly accepted there. Leave the Monero seed-offset passphrase empty and use a restore date before the first incoming transaction. The 25 words restore Monero only. Trezor uses a different Monero derivation.

Import support and address discovery vary between wallets; matching words alone do not guarantee matching addresses. Zcash shielded and Unified Addresses are outside this app's scope. BrainBIP displays receiving addresses and does not query balances or sign transactions.

Application versions are separate from the fixed recovery identifiers **`brainbip-v1`** and **`ledger-bip39-v1`**. Keep the [derivation specification](docs/derivation.md) or a verified offline release available for recovery.

## Build and contribute

```sh
npm ci
npm run dev
```

Requires Node.js 24 or later. The preview runs at `http://127.0.0.1:4173`; `dist/brainbip.html` is the complete offline edition. See [CONTRIBUTING.md](CONTRIBUTING.md) for checks, browser tests, and release conventions.

Inspired by [WarpWallet](https://github.com/keybase/warpwallet). Cryptographic primitives use [hash-wasm](https://github.com/Daninet/hash-wasm), [noble](https://github.com/paulmillr/noble-hashes), [scure](https://github.com/paulmillr/scure-bip39), and [micro-key-producer](https://github.com/paulmillr/micro-key-producer); local estimates use [zxcvbn-ts](https://github.com/zxcvbn-ts/zxcvbn).

## License

BrainBIP code is [MIT licensed](LICENSE). Bundled dependencies, fonts, and data retain their own licenses, including ODC-BY, SIL OFL, and the Monero wordlist's BSD-3-Clause notice. Every standalone build includes the full third-party notices.
