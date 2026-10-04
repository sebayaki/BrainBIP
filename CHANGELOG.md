# Changelog

Application versions describe the interface, packaging, and supported features. The recovery profiles `brainbip-v1` and `ledger-bip39-v1` are versioned separately and remain fixed.

## [Unreleased]

No changes yet.

## [0.2.0] - 2026-10-04

The first tagged release brings the existing public previews together with a maintainable source layout and a verified offline distribution. BrainBIP remains experimental and unaudited.

### Added

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

- Existing passphrase/email inputs still produce the same twelve BIP39 words and BTC, ETH, SOL, and ZEC addresses.
- Argon2id and PBKDF2 parameters, input normalization, and existing derivation paths are unchanged.
- Monero restoration in ordinary software wallets uses the separate 25-word phrase; the twelve BIP39 words are not a native Monero seed.

## Preview history

The initial four-chain preview and subsequent Monero/UI update were published on 2026-10-04 without Git tags or GitHub Releases. The earlier package version was `0.1.0`; it does not identify a separately archived release.

[Unreleased]: https://github.com/sebayaki/BrainBIP/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/sebayaki/BrainBIP/releases/tag/v0.2.0
