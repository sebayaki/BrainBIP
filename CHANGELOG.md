# Changelog

Application versions describe the interface, packaging, and supported features. The application uses one fixed derivation algorithm.

## [Unreleased]

No changes yet.

## [0.2.0] - 2026-10-04

The first tagged release includes a self-contained offline app for twelve-word recovery and four-chain receiving addresses. BrainBIP remains experimental and unaudited.

### Added

- A fixed derivation using Argon2id with 512 MiB, 16 passes, and one lane, plus PBKDF2-HMAC-SHA256 with 5,242,880 iterations.
- Full-cost fixtures from independent Argon2, PBKDF2, BIP39, and address reference implementations.
- Elapsed time and stage-based loading during derivation, without an invented completion percentage or guaranteed execution time.
- Embedded SVG icons and full network names for Bitcoin, Ethereum, Solana, and Zcash.
- An opt-in private-email estimate switch. It starts off and never changes the generated wallet.
- Mobile WebKit coverage and independent cryptographic reference checks.
- Versioned HTML and distribution metadata, consistent code formatting and linting, and shared verification for Pages and GitHub Releases.

### Changed

- Renewed the interface with embedded typography, 16px inputs, responsive recovery cards, and concise expandable documentation.
- Separated worker ownership, recovery display, clipboard handling, and strength estimation into focused modules.
- Shared Unicode validation and input normalization while preserving wallet validation and estimation limits.
- Reorganized the README, development guide, security model, and release instructions.

### Removed

- Monero support, keeping all four supported networks on one consistent twelve-word BIP39 recovery phrase.
- Derivation version selection and backward compatibility, leaving one fixed strengthened algorithm.

[Unreleased]: https://github.com/sebayaki/BrainBIP/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/sebayaki/BrainBIP/releases/tag/v0.2.0
