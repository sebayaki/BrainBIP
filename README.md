![BrainBIP — A passphrase. 12 or 24 words. Four chains.](assets/banner.svg)

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

BrainBIP turns a **passphrase + optional email salt** into **12 or 24 BIP39 recovery words** and twenty receiving addresses each for Bitcoin, Ethereum, Solana, and Zcash.

The interface, cryptographic code, dictionaries, fonts, and WebAssembly fit in **one HTML file**. Everything runs on your device, including strength estimates. No server, CDN, RPC, analytics, or runtime downloads are required. The hosted page also includes link-preview metadata and a share image; the offline app needs neither an image download nor a connection.

> **Experimental and unaudited.** Argon2id and PBKDF2 make guessing more expensive; they cannot give a predictable passphrase the security of randomly generated recovery words. Read the [security model](docs/security.md) before using the tool.

## Use BrainBIP

1. Open the [demo](https://sebayaki.github.io/BrainBIP/) or download the [offline edition](https://sebayaki.github.io/BrainBIP/brainbip.html). The demo's **Offline edition** button saves the complete app; open that file locally to work without a connection.
2. Choose **12 or 24 words** (12 is the default), enter a passphrase and optional email salt, then select **Generate recovery phrase**.
3. Reveal the selected phrase and browse the four network tabs. You can switch word count without repeating the heavy computation; switching hides the words and restores default address choices. Choose an address path preset, or enter a custom path, to view twenty addresses for that selection.
4. Use the reset control to discard inputs and results. Your system clipboard is not cleared.

Use [Releases](https://github.com/sebayaki/BrainBIP/releases) for the versioned `brainbip.html` download and verify release files against that release's accompanying `SHA256SUMS.txt`. The hosted demo follows `main`; its [separate checksum file](https://sebayaki.github.io/BrainBIP/SHA256SUMS.txt) covers the Pages distribution, including `index.html`. See the [downloaded artifact scopes](docs/releases.md#downloaded-artifacts).

The app requires a modern browser with WebAssembly and Web Workers, plus **512 MiB of derivation memory**, with additional browser overhead. Some devices cannot allocate this memory. The computation cost is fixed and never reduced automatically. Execution time varies by device; the interface shows elapsed time and the current stage.

## What it does

- **Deterministic recovery words:** the same normalized inputs and word count reproduce the same phrase.
- **12 or 24 words:** choose before or after generation. Each length produces a different wallet.
- **One fixed computation:** Argon2id and PBKDF2 run once with the same parameters on every device; both word counts are prepared from the result.
- **Address path choices:** Bitcoin address types, Ethereum Ledger layouts, Solana paths, and custom templates.
- **Eighty default addresses per phrase:** twenty per chain, with the selected path template in the address header. Changing a path derives addresses locally without repeating the heavy computation.
- **Four network tabs:** Bitcoin, Ethereum, Solana, and Zcash, with full names and embedded SVG icons.
- **Explicit secret controls:** reveal, hide, copy, cancel, and reset.
- **Local guesswork estimates:** visible model bits and a compact strength meter, plus a plain illustrative time under an explicit assumed guessing rate. The private-email switch starts **OFF** and changes the estimate only.
- **Portable offline use:** an embedded build with checksums and third-party notices.

The time comparison defaults to **one total guess per second**, with 0.1 and 1,000 available in its details. Long durations show the full approximate number of years with comma-separated digits. These are comparison assumptions, not measured attacker speeds or your browser's generation speed. The meter is a model summary, not a safety guarantee. Limited model coverage is shown as a limitation instead of a confident time estimate; conditional private-email credit keeps the passphrase-only estimate available. See the [estimate assumptions](docs/security.md#email-and-strength-estimates).

## Recovery

To regenerate the words in BrainBIP, use your original passphrase and, if you included an email salt, the same email. You do not need that email when importing already generated words into another wallet.

The generated English BIP39 phrase uses an **empty additional BIP39 passphrase**. Your original BrainBIP passphrase is already used to derive the words; do not enter it again as another wallet's additional passphrase.

Use the **same word count** for recovery. The 12- and 24-word outputs lead to different wallets; do not shorten or extend either phrase. They share the same underlying calculation and are related secrets. A 24-word phrase has a larger encoding capacity, but selecting it does not add unpredictability to your inputs or raise the displayed strength estimate.

The initial address lists use these defaults:

| Chain    | Receiving addresses      | Default path, `i = 0…19` |
| -------- | ------------------------ | ------------------------ |
| Bitcoin  | Native SegWit, `bc1q…`   | `m/84'/0'/0'/0/i`        |
| Ethereum | EIP-55 checksummed       | `m/44'/60'/0'/0/i`       |
| Solana   | Ed25519, Base58          | `m/44'/501'/i'/0'`       |
| Zcash    | Transparent P2PKH, `t1…` | `m/44'/133'/0'/0/i`      |

Bitcoin also offers Nested SegWit and Legacy; Ethereum offers Ledger legacy and Ledger Live; Solana offers the shorter BIP44 account path. Every chain accepts a bounded custom path with one `{index}` placeholder. Solana paths must be entirely hardened; custom Bitcoin paths require an explicit address type. See the [preset and custom-path specification](docs/derivation.md#4-derive-mainnet-addresses).

Keep the selected path and address type for recovery. Choosing a different path changes the addresses while keeping the selected recovery phrase unchanged. Import support and address discovery vary between wallets; matching words alone do not guarantee matching addresses. Zcash shielded and Unified Addresses are outside this app's scope. BrainBIP displays receiving addresses and does not query balances or sign transactions.

Keep the [derivation specification](docs/derivation.md) or a verified offline release available for recovery. The input-to-entropy computation and both word-count mappings are fixed; the application version identifies the software build.

## Build and contribute

```sh
npm ci
npm run dev
```

Requires Node.js 24 or later. The preview runs at `http://127.0.0.1:4173`; `dist/brainbip.html` is the complete offline edition. See [CONTRIBUTING.md](CONTRIBUTING.md) for checks, browser tests, and release conventions.

Inspired by [WarpWallet](https://github.com/keybase/warpwallet). Cryptographic primitives use [hash-wasm](https://github.com/Daninet/hash-wasm), [noble](https://github.com/paulmillr/noble-hashes), [scure](https://github.com/paulmillr/scure-bip39), and [micro-key-producer](https://github.com/paulmillr/micro-key-producer); local estimates use [zxcvbn-ts](https://github.com/zxcvbn-ts/zxcvbn).

## License

BrainBIP code is [MIT licensed](LICENSE). Bundled dependencies, fonts, and data retain their own licenses, including ODC-BY and SIL OFL. Network icons come from [spothq/cryptocurrency-icons](https://github.com/spothq/cryptocurrency-icons) under [CC0](licenses/Cryptocurrency-Icons-LICENSE). Every standalone build includes the full third-party notices.
