# Changelog

Application versions describe the interface, packaging, and supported features. The recovery profiles `brainbip-v1`, `brainbip-v2`, and `ledger-bip39-v1` are versioned separately and remain fixed.

## [Unreleased]

No changes yet.

## [0.2.0] - 2026-10-04

The first tagged release brings the existing public previews together with a maintainable source layout and a verified offline distribution. BrainBIP remains experimental and unaudited.

### Added

- A higher-cost `brainbip-v2` profile for new generation: Argon2id uses 512 MiB, 16 passes, and one lane; PBKDF2-HMAC-SHA256 uses 5,242,880 iterations. The original v1 profile remains selectable for recovery.
- Separate full-cost v2 fixtures from independent Argon2, PBKDF2, BIP39, and address reference implementations, preserving the original v1 vectors.
- Elapsed time and stage-based loading during derivation, without an invented completion percentage or guaranteed execution time.
- Monero primary address and nineteen subaddresses, with a separate native 25-word recovery phrase using the frozen Ledger mapping.
- An opt-in private-email estimate switch. It starts off and never changes the generated wallet.
- Mobile WebKit coverage, native Monero interoperability fixtures, and independent reference checks for all forty Monero fixture addresses.
- Versioned HTML and distribution metadata, consistent code formatting and linting, and shared verification for Pages and GitHub Releases.

### Changed

- Renewed the interface with embedded typography, 16px inputs, responsive recovery cards, and concise expandable documentation.
- Separated worker ownership, recovery display, clipboard handling, and strength estimation into focused modules.
- Shared Unicode validation and input normalization while preserving wallet validation and estimation limits.
- Reorganized the README, development guide, security model, and release instructions.

### Recovery compatibility

- Selecting `brainbip-v1` preserves existing passphrase/email inputs, twelve BIP39 words, and BTC, ETH, SOL, and ZEC addresses.
- V1 Argon2id and PBKDF2 parameters, input normalization, and existing derivation paths are unchanged. V2 is the default for new generation and produces a different wallet from the same inputs; it does not migrate an existing wallet.
- Monero restoration in ordinary software wallets uses the separate 25-word phrase; the twelve BIP39 words are not a native Monero seed.

## Preview history

The initial four-chain preview and subsequent Monero/UI update were published on 2026-10-04 without Git tags or GitHub Releases. The earlier package version was `0.1.0`; it does not identify a separately archived release.

[Unreleased]: https://github.com/sebayaki/BrainBIP/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/sebayaki/BrainBIP/releases/tag/v0.2.0
