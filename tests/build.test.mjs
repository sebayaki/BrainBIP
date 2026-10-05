import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const file = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const project = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const distributionFiles = [
  'index.html',
  'brainbip.html',
  'VERSION.json',
  'THIRD_PARTY_NOTICES.txt',
  'LICENSE',
  'social-card.png',
  'sitemap.xml',
];
const checksum = (data, encoding) => createHash('sha256').update(data).digest(encoding);

test('social metadata points to the shipped card and canonical sitemap', async () => {
  const meta = (key) => {
    const tag = [...file.matchAll(/<meta\s[^>]*>/g)]
      .map(([value]) => value)
      .find((value) => value.includes(`="${key}"`));
    return tag?.match(/content="([^"]*)"/)?.[1];
  };
  assert.ok(file.includes(`rel="canonical" href="${project.homepage}"`));
  assert.equal(meta('og:url'), project.homepage);
  assert.equal(meta('og:type'), 'website');
  assert.equal(meta('twitter:card'), 'summary_large_image');
  for (const key of ['og:image', 'twitter:image'])
    assert.equal(meta(key), project.homepage + 'social-card.png');
  assert.equal(meta('og:image:type'), 'image/png');
  assert.equal(meta('og:image:width'), '1200');
  assert.equal(meta('og:image:height'), '630');
  assert.ok(meta('og:image:alt'));
  assert.equal(meta('twitter:image:alt'), meta('og:image:alt'));
  const card = await readFile(new URL('../dist/social-card.png', import.meta.url));
  assert.equal(card.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(card.readUInt32BE(16), 1200);
  assert.equal(card.readUInt32BE(20), 630);
  const sitemap = await readFile(new URL('../dist/sitemap.xml', import.meta.url), 'utf8');
  assert.deepEqual(
    [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url),
    [project.homepage],
  );
});

test('the offline edition is byte-identical to the hosted edition', async () => {
  assert.equal(await readFile(new URL('../dist/brainbip.html', import.meta.url), 'utf8'), file);
  const sums = await readFile(new URL('../dist/SHA256SUMS.txt', import.meta.url), 'utf8');
  let expected = '';
  for (const name of distributionFiles) {
    const bytes = await readFile(new URL(`../dist/${name}`, import.meta.url));
    expected += `${checksum(bytes, 'hex')}  ${name}\n`;
  }
  assert.equal(sums, expected);
  assert.deepEqual(
    (await readdir(new URL('../dist/', import.meta.url))).sort(),
    [...distributionFiles, '.nojekyll', 'SHA256SUMS.txt'].sort(),
  );
});

test('application metadata and footer match the package version', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../dist/VERSION.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(manifest, { name: 'BrainBIP', version: project.version });
  assert.ok(file.includes(`<meta name="application-version" content="${project.version}">`));
  const footerVersion = file.match(/<span id="app-version">\s*([^<]+)<\/span\s*>/);
  assert.equal(footerVersion?.[1].trim(), `v${project.version}`);
});

test('release downloads contain one HTML and a manifest covering only the shipped payloads', async () => {
  execFileSync(process.execPath, [
    fileURLToPath(new URL('../scripts/release.mjs', import.meta.url)),
    'package',
    `v${project.version}`,
  ]);
  const release = new URL('../release-dist/', import.meta.url);
  const payloads = distributionFiles.filter((name) => name !== 'index.html');
  assert.deepEqual((await readdir(release)).sort(), [...payloads, 'SHA256SUMS.txt'].sort());
  const sums = await readFile(new URL('SHA256SUMS.txt', release), 'utf8');
  const entries = sums.trim().split('\n');
  assert.equal(entries.length, payloads.length);
  assert.doesNotMatch(sums, /index\.html/);
  for (const name of payloads) {
    const bytes = await readFile(new URL(name, release));
    assert.deepEqual(bytes, await readFile(new URL(`../dist/${name}`, import.meta.url)));
    assert.ok(entries.includes(`${checksum(bytes, 'hex')}  ${name}`));
  }
  assert.equal(await readFile(new URL('../dist/index.html', import.meta.url), 'utf8'), file);
});

test('executable assets are inline and covered by a restrictive CSP', () => {
  const script = [...file.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const styles = [...file.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  assert.equal(script.length, 1);
  assert.equal(styles.length, 1);
  for (const [, content] of [...script, ...styles]) {
    assert.ok(file.includes(`sha256-${checksum(content, 'base64')}`));
  }
  assert.match(file, /connect-src (?:&#39;|'|&apos;)none/);
  assert.match(file, /font-src data:/);
  assert.match(file, /data:font\/woff2;base64,/);
  assert.doesNotMatch(file, /<script[^>]+src\s*=/i);
  assert.doesNotMatch(file, /<link[^>]+rel=["'](?:stylesheet|modulepreload|preload)["']/i);
  assert.doesNotMatch(
    file,
    /<!-- (?:APP_STYLES|APP_SCRIPT|APP_METADATA|APP_VERSION|CSP|THIRD_PARTY) -->/,
  );
});

test('distribution contains attribution and excludes local build paths and source maps', async () => {
  assert.doesNotMatch(file, /\/(?:Users|home)\/[\w.-]+\//);
  assert.doesNotMatch(file, /sourceMappingURL=/);
  const notices = await readFile(
    new URL('../dist/THIRD_PARTY_NOTICES.txt', import.meta.url),
    'utf8',
  );
  assert.ok(notices.includes('https://opendatacommons.org/licenses/by/1-0/'));
  for (const name of [
    '@scure/bip39',
    '@scure/bip32',
    '@noble/hashes',
    '@noble/curves',
    'hash-wasm',
    '@zxcvbn-ts/core',
    'ODC-BY',
    'The Go Authors',
    '@fontsource-variable/instrument-sans',
    '@fontsource/ibm-plex-mono',
    'Cryptocurrency Icons',
    'CC0 1.0 Universal',
  ]) {
    assert.ok(notices.includes(name), `Missing attribution: ${name}`);
    assert.ok(file.includes(name), `Offline attribution missing: ${name}`);
  }
});
