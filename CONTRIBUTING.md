# Contributing

BrainBIP is a static, offline-capable application. Source lives in `src/`; `scripts/build.mjs` bundles the interface, workers, WebAssembly, fonts, and notices into `dist/index.html` and the byte-identical `dist/brainbip.html`. Generated files and browser-test output are not committed.

## Local setup

Use **Node.js 24 or later** and the committed npm lockfile.

```sh
npm ci
npm run dev
```

The preview is served at `http://127.0.0.1:4173`. Open the generated `dist/brainbip.html` directly to check standalone-file behavior.

## Checks

```sh
npm run format       # Apply repository formatting
npm run lint         # Static JavaScript checks
npm run check        # Formatting, lint, versions, unit tests, build, and packaging
npx playwright install webkit
npm run test:browser # Desktop Chrome and mobile WebKit
```

Local desktop tests use an installed Google Chrome; mobile tests use Playwright WebKit. CI installs Chromium and WebKit. Playwright WebKit checks browser-engine behavior and mobile layouts; it does not replace testing on a physical iPhone.

Use `npm run format:check` to check formatting without editing files and `npm run check:repo` to check version, lockfile, and changelog consistency. `npm test` runs unit tests, `npm run build` regenerates the offline edition, and `npm run test:build` checks an existing build. Review desktop and narrow layouts, cancellation, input edits, reset, secret reveal/copy, and offline execution when changing the interface.

The original full-cost fixture in `tests/fixtures/brainbip-v1.json` preserves the v1 mnemonic and eighty BTC/ETH/SOL/ZEC addresses. `tests/fixtures/brainbip-v2.json` records the separate v2 mapping using the same public input case and independent reference implementations. Monero vectors live separately in `tests/fixtures/monero-ledger-v1.json`. Fixtures are deliberately public and must never receive funds. Ordinary tests must not rewrite their expected values.

An optional independent Monero C++ WebAssembly check uses a temporary, test-only installation:

```sh
reference_dir="$(mktemp -d)"
npm install --prefix "$reference_dir" --no-package-lock --ignore-scripts monero-ts@0.11.3
node tests/reference-monero.mjs "$reference_dir"
```

The reference script pins the native binary hashes, disables HTTP transport, and restores both public 25-word phrases to compare all twenty addresses. It is not a production dependency.

## Changes and compatibility

- Preserve `brainbip-v1`, `brainbip-v2`, and `ledger-bip39-v1`. Changing an existing input mapping, normalization, KDF parameter, path, or address encoding requires a new recovery identifier and explicit compatibility documentation. Keep v1 recovery available when changing the default for new generation.
- Keep runtime resources embedded. Do not add a CDN, analytics, RPC, browser storage for inputs, or logging of secret values.
- Keep estimates distinct from measured entropy. The private-email switch is opt-in and affects estimates only.
- Show actual derivation stages and elapsed time. The bundled Argon2 API has no intermediate progress callback; do not present elapsed time as a measured completion percentage. Runtime benchmarks must never alter a recovery profile's KDF parameters or silently choose another profile.
- Use public fixtures in tests and reports. Include the relevant checks and behavior in pull requests; never include real passphrases, recovery words, keys, or personal screenshots.
- Retain upstream licenses and attribution when adding code, data, or fonts. The offline edition must include notices for everything it bundles.

## Versions and distribution

Application versions follow `package.json` and identify software builds. They are separate from immutable recovery identifiers. Record user-visible changes in `CHANGELOG.md` and keep version metadata consistent before publishing a `v`-prefixed release tag. Build metadata appears in the app and `VERSION.json`.

The **Check** workflow validates changes through shared verification. **Deploy GitHub Pages** publishes a verified build from `main`; repository owners configure GitHub Actions as the Pages source. **Release** verifies a version tag and produces versioned offline assets, checksums, license, third-party notices, and a version manifest. See [release conventions](docs/releases.md) for the publishing procedure. Checksums and passing tests are not a security audit.
