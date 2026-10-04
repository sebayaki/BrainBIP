# Versions and releases

The application version lives in `package.json`. The lockfile, newest dated changelog entry, generated HTML footer, application metadata, and `VERSION.json` must agree. `npm run check:repo` checks the source metadata, and packaging tests check the generated output.

Application versions follow `MAJOR.MINOR.PATCH`, optionally followed by a prerelease identifier such as `0.3.0-rc.1`. Build metadata is not used. While the project is below 1.0, it remains experimental and unaudited. A release label is not a security certification.

## One fixed derivation

The app exposes one fixed input-to-entropy computation, 12- and 24-word BIP39 mappings, and selectable Bitcoin, Ethereum, Solana, and Zcash address mappings. Application versions identify software builds; they are not adjustable KDF parameters. Both word counts use the same completed computation, but produce different wallets. Address presets and custom paths operate on the selected phrase and do not change its derivation.

Check interface and dependency changes against the independent derivation vectors. Keep the specification, tests, and release notes aligned with both word-count mappings and the address presets shipped in the build. Runtime parameters never adapt to device performance. Release 0.4.0 adds 24-word output from all 32 XOR bytes while retaining the fixed KDF parameters and first-16-byte mapping for 12 words.

## Prepare a version

1. Update the app version and lockfile with `npm version X.Y.Z --no-git-tag-version --ignore-scripts`.
2. Add a dated entry at the top of `CHANGELOG.md`, below `Unreleased`. Describe the resulting behavior and any change to deterministic outputs. The changelog is the source for GitHub release notes.
3. Run `npm run format`, `npm run check`, and `npm run test:browser`. Inspect the generated offline HTML and keep real wallet material out of tests and artifacts.
4. Review and commit the exact source to be published. Push it to `main`; the **Check** workflow verifies it and publishes the verified artifact to Pages.
5. Once that run succeeds, create an annotated tag on that exact commit, then push the specific tag:

   ```sh
   git tag -a vX.Y.Z -m "BrainBIP vX.Y.Z" <verified-commit>
   git push origin vX.Y.Z
   ```

Do not reuse or move a published version tag. A tag's suffix must exactly equal the package version; the release workflow rejects mismatches.

## What the workflows do

| Workflow                           | Trigger                                        | Result                                                                                                   |
| ---------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ci.yml` — Check                   | Pull request, push to `main`, or manual run    | Shared verification; Pages publication only from `main`                                                  |
| `verify.yml` — Verify distribution | Called by Check or Release                     | Formatting, lint, metadata, cryptographic vectors, packaging, browser tests, then a saved build artifact |
| `pages.yml` — Deploy GitHub Pages  | Called after verified `main` builds            | Verifies downloaded checksums and publishes that same artifact                                           |
| `release.yml` — Release            | A `v*` tag or manual retry for an existing tag | Validates the version, runs shared verification, and publishes notes and verified assets                 |

Third-party actions are pinned to full commit hashes. Build and test jobs have read-only repository access. Publication permissions are confined to the Pages and Release jobs. Release notes are generated from the changelog.

## Downloaded artifacts

Each GitHub Release includes:

- `brainbip.html` — the complete offline application.
- `index.html` — the byte-identical hosted edition.
- `VERSION.json` — application name and version.
- `SHA256SUMS.txt` — checksums for both HTML files, version metadata, and notices.
- `LICENSE` and `THIRD_PARTY_NOTICES.txt` — the project and bundled dependency licenses.

After downloading all six assets into one directory, verify them with `sha256sum --check SHA256SUMS.txt` on Linux or `shasum -a 256 --check SHA256SUMS.txt` on macOS. A checksum verifies bytes against a manifest; it is not an independent authenticity guarantee. Check the repository, version tag, and source as well.

The release is assembled as a draft so partially uploaded assets are not published. Once all uploads succeed, the workflow publishes it. Tags with a prerelease suffix are marked as prereleases and do not replace the latest regular release. Published release assets are never overwritten by this workflow.

If publication fails after creating a draft, rerun **Release** with the same existing tag. It refreshes that draft from a newly verified build and completes publication. If a published version needs a correction, prepare a new version instead. GitHub-generated source archives are separate from the ready-to-run HTML assets.
