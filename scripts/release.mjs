import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readProject, releaseEntry } from './lib/project.mjs';

const [command, tag] = process.argv.slice(2);
if (!['check', 'notes', 'package'].includes(command))
  throw new Error('Usage: node scripts/release.mjs <check|notes|package> <vX.Y.Z>');
const project = await readProject();
assert.equal(tag, `v${project.version}`, 'Release tag must match package.json exactly.');
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const { date, body } = releaseEntry(changelog, project.version);
if (command === 'check') {
  console.log(`Release metadata verified: ${tag} (${date}).`);
} else if (command === 'package') {
  const source = new URL('../dist/', import.meta.url);
  const destination = new URL('../release-dist/', import.meta.url);
  const manifest = await readFile(new URL('SHA256SUMS.txt', source), 'utf8');
  const version = JSON.parse(await readFile(new URL('VERSION.json', source), 'utf8'));
  assert.equal(version.version, project.version, 'Build version must match the release.');
  const files = new Map();
  let checksums = '';
  for (const name of [
    'brainbip.html',
    'VERSION.json',
    'LICENSE',
    'THIRD_PARTY_NOTICES.txt',
    'social-card.png',
    'sitemap.xml',
  ]) {
    const content = await readFile(new URL(name, source));
    const hash = createHash('sha256').update(content).digest('hex');
    const entry = `${hash}  ${name}`;
    assert.ok(manifest.split('\n').includes(entry), `Build checksum mismatch: ${name}.`);
    files.set(name, content);
    checksums += `${entry}\n`;
  }
  // Package only downloadable assets; the hosted index remains in dist.
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination);
  for (const [name, content] of files) await writeFile(new URL(name, destination), content);
  await writeFile(new URL('SHA256SUMS.txt', destination), checksums);
  console.log(`Packaged ${tag}: ${files.size + 1} release assets, one HTML download.`);
} else {
  console.log(
    `# BrainBIP ${tag}\n\n${body}\n\n## Downloads\n\nDownload \`brainbip.html\` for the complete offline app. It is the only HTML download you need. \`VERSION.json\` identifies the application version; \`SHA256SUMS.txt\` covers the six files included alongside it in this release.\n\nThis release uses the fixed \`brainbip-v2\` stretching algorithm, separate from the application version. Select 12 or 24 recovery words; each length produces a different wallet. Recovery also requires the matching address path and type.\n\nExperimental, unaudited software. Never fund public test-vector addresses.\n`,
  );
}
