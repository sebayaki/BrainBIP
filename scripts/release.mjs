import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readProject, releaseEntry } from './lib/project.mjs';

const [command, tag] = process.argv.slice(2);
if (!['check', 'notes'].includes(command))
  throw new Error('Usage: node scripts/release.mjs <check|notes> <vX.Y.Z>');
const project = await readProject();
assert.equal(tag, `v${project.version}`, 'Release tag must match package.json exactly.');
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const { date, body } = releaseEntry(changelog, project.version);
if (command === 'check') {
  console.log(`Release metadata verified: ${tag} (${date}).`);
} else {
  console.log(
    `# BrainBIP ${tag}\n\n${body}\n\n## Downloads\n\nDownload \`brainbip.html\` for the complete offline app. \`index.html\` contains the same bytes. \`VERSION.json\` identifies the application version; \`SHA256SUMS.txt\` covers the HTML, version metadata, license, and third-party notices.\n\nThe application version does not change the fixed \`brainbip-v1\` recovery profile or \`ledger-bip39-v1\` Monero mapping.\n\nExperimental, unaudited software. Never fund public test-vector addresses.\n`,
  );
}
