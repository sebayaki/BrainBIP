# Changelog

Application versions describe the interface, packaging, and supported features. The application uses one fixed passphrase-stretching algorithm.

## [Unreleased]

No changes yet.

## [0.5.0] - 2026-10-05

### Added

- A neutral logarithmic time axis spanning one second to one hundred years, with a point for modelled guesswork under an explicit comparison assumption.
- A default assumption of one total guess per second, with 0.1 and 1,000 selectable in the estimate details and the chosen rate always visible.
- Model bits and guess counts in details, retaining the passphrase-only value alongside conditional private-email credit.

### Changed

- Replaced the primary bits meter with the time comparison; the rate is an assumption rather than an attacker benchmark or browser-speed measurement.
- Present limited model coverage as a limitation instead of a confident time estimate. Comparison times use the modelled guess count divided by the selected total rate, without an average-search halving assumption.
- Kept the private-email switch off by default, the estimate cap at 128 for both word counts, and all fixed KDF, mnemonic, and address outputs unchanged.

## [0.4.1] - 2026-10-04

### Added

- Open Graph and Twitter Card metadata with a 1200×630 share image, descriptive alternative text, and the canonical hosted URL.
- A single-URL XML sitemap and explicit indexing metadata for the hosted page.
- The share image and sitemap in verified Pages and Release artifacts, including their checksums.

### Changed

- More compact desktop and mobile layouts, with the selected address path in the header instead of repeated path and position labels on every row.
- Kept the hosted and offline HTML byte-identical and self-contained. Share metadata introduces no runtime resource requests; wallet derivation and outputs are unchanged.

### Fixed

- Aligned loading labels with their graphics at every screen size.
- Placed the path label and selector on one line, with consistent typography and no redundant network or row-count labels.
- Removed the narrow desktop documentation caption width that left its final word on a separate line.

## [0.4.0] - 2026-10-04

### Added

- A 12- or 24-word BIP39 choice before and after generation, with 12 words selected by default.
- Both phrases and their eighty default addresses from one Argon2id/PBKDF2 computation: 12 words use the first 16 XOR bytes, and 24 words use all 32 bytes.
- Independent 24-word BIP39 and address reference fixtures.
- SVG icons and full network names in the initial chain pills as well as the result tabs.

### Changed

- Switching word count hides the recovery phrase and restores default address selections without rerunning the heavy computation.
- Clarified that word count is a recovery condition and selects a different wallet; the two phrases are related outputs, and 24 words do not increase input entropy.
- Kept the displayed strength estimate capped at 128 for both word counts. Selecting 24 words does not raise the estimate.

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

[Unreleased]: https://github.com/sebayaki/BrainBIP/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/sebayaki/BrainBIP/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/sebayaki/BrainBIP/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/sebayaki/BrainBIP/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/sebayaki/BrainBIP/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/sebayaki/BrainBIP/releases/tag/v0.2.0
