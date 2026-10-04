# Changelog

Application versions describe the interface, packaging, and supported features. The application uses one fixed input-to-mnemonic algorithm.

## [Unreleased]

No changes yet.

## [0.3.0] - 2026-10-04

### Added

- Per-chain address path presets: Bitcoin Native SegWit, Nested SegWit, and Legacy; Ethereum Standard, Ledger legacy, and Ledger Live; Solana BIP44 with change and BIP44; Zcash transparent BIP44.
- Custom address path templates with exactly one `{index}` placeholder, at most ten components and 160 characters, hardened-only Solana paths, and an explicit Bitcoin address type.
- Local address regeneration in a short-lived worker when a path changes, without repeating the passphrase-stretching Argon2id/PBKDF2-HMAC-SHA256 stages or making network requests.
- Independent reference fixtures for all nine presets and four custom paths, covering 260 complete paths and addresses.

### Changed

- Compact address rows with the complete derivation path always visible.
- Simplified the fixed-algorithm interface by removing the redundant V2 label.
- Preserved the twelve-word derivation and all eighty default receiving addresses from 0.2.0.

### Fixed

- Reset control icon rendering.

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

[Unreleased]: https://github.com/sebayaki/BrainBIP/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/sebayaki/BrainBIP/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/sebayaki/BrainBIP/releases/tag/v0.2.0
