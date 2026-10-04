# Contributing

BrainBIP is a static, offline-capable application. Source lives in `src/`; `scripts/build.mjs` bundles the interface, workers, WebAssembly, fonts, and notices into `dist/index.html` and the byte-identical `dist/brainbip.html`. It also packages the hosted share image and XML sitemap. These are crawler assets, not dependencies of the offline app. Generated files and browser-test output are not committed.

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

Use `npm run format:check` to check formatting without editing files and `npm run check:repo` to check version, lockfile, and changelog consistency. `npm test` runs unit tests, `npm run build` regenerates the offline edition, and `npm run test:build` checks an existing build. Review desktop and narrow layouts, cancellation, input edits, reset, secret reveal/copy, word-count switching, address path selection, and offline execution when changing the interface.

The full-cost fixture in `tests/fixtures/brainbip-v2.json` records the fixed computation, 12-word phrase, and eighty default BTC/ETH/SOL/ZEC addresses using independent reference implementations. `tests/fixtures/brainbip-24.json` checks the 24-word mapping and its eighty addresses from the same verified KDF outputs. `tests/fixtures/address-presets.json` adds thirteen independent vectors with twenty rows each, covering all nine presets and one custom path per chain. Address tests also check published Bitcoin reference vectors. Fixtures are deliberately public and must never receive funds. Ordinary tests must not rewrite their expected values; generators run explicitly with `node tests/reference-24.mjs --write` or `node tests/reference-addresses.mjs --write`.

## Changes

- Check cryptographic changes against the independent derivation vectors. Keep the specification and tests aligned with the fixed computation, both word-count mappings, and supported address mappings, including input normalization, KDF parameters, paths, and address encodings.
- Compute Argon2id, PBKDF2-HMAC-SHA256, and their 32-byte XOR once. Encode 12 words from the first 16 bytes and 24 words from all 32 bytes, each with its own BIP39 checksum. Never truncate or pad a mnemonic to change its length.
- Test selection before and after generation. Switching word count must use the prepared result, hide words, cancel pending address work, clear clipboard feedback, and restore default address choices. Reset must release both prepared phrases. Word count must not raise the input strength estimate or change its 128 cap.
- Validate address choices in the worker as well as the UI. Keep custom paths bounded, require exactly one `{index}`, and reject non-hardened Solana components. Bitcoin presets must pair the path with the correct address encoding; custom Bitcoin paths require an explicit type.
- Changing an address path must keep the recovery phrase and fixed KDF untouched. Derive the selected chain's twenty addresses in a short-lived worker, and reject stale results after another selection, input edit, or reset.
- Keep runtime resources embedded. Do not add a CDN, analytics, RPC, browser storage for inputs, or logging of secret values.
- Keep canonical and social-preview URLs aligned with the package homepage. Preview metadata must describe the experiment accurately and contain no wallet material. Check the shipped PNG dimensions, sitemap URL, and checksums without adding runtime image fetches or weakening the content security policy.
- Keep estimates distinct from measured entropy. The private-email switch is opt-in and affects estimates only.
- Show actual derivation stages and elapsed time. The bundled Argon2 API has no intermediate progress callback; do not present elapsed time as a measured completion percentage. Runtime benchmarks must never alter the fixed KDF parameters.
- Use public fixtures in tests and reports. Include the relevant checks and behavior in pull requests; never include real passphrases, recovery words, keys, or personal screenshots.
- Retain upstream licenses and attribution when adding code, data, or fonts. The offline edition must include notices for everything it bundles.

## Versions and distribution

Application versions follow `package.json` and identify software builds. Record user-visible changes in `CHANGELOG.md` and keep version metadata consistent before publishing a `v`-prefixed release tag. Build metadata appears in the app and `VERSION.json`.

The **Check** workflow validates changes through shared verification. **Deploy GitHub Pages** publishes a verified build from `main`; repository owners configure GitHub Actions as the Pages source. **Release** verifies a version tag and produces versioned offline assets, checksums, license, third-party notices, a version manifest, and hosted crawler assets. See [release conventions](docs/releases.md) for the publishing procedure. Checksums and passing tests are not a security audit.
