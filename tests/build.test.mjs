import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const file = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const checksum = (data, encoding) => createHash('sha256').update(data).digest(encoding);

test('the offline edition is byte-identical to the hosted edition', async () => {
  assert.equal(await readFile(new URL('../dist/brainbip.html', import.meta.url), 'utf8'), file);
  const sums = await readFile(new URL('../dist/SHA256SUMS.txt', import.meta.url), 'utf8');
  assert.equal(sums, `${checksum(file, 'hex')}  index.html\n${checksum(file, 'hex')}  brainbip.html\n`);
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
  assert.doesNotMatch(file, /<!-- (?:APP_STYLES|APP_SCRIPT|CSP|THIRD_PARTY) -->/);
});

test('distribution contains attribution and excludes local build paths and source maps', async () => {
  assert.doesNotMatch(file, /\/(?:Users|home)\/[\w.-]+\//);
  assert.doesNotMatch(file, /sourceMappingURL=/);
  const notices = await readFile(new URL('../dist/THIRD_PARTY_NOTICES.txt', import.meta.url), 'utf8');
  assert.ok(notices.includes('https://opendatacommons.org/licenses/by/1-0/'));
  for (const name of ['@scure/bip39', '@scure/bip32', '@noble/hashes', '@noble/curves', 'hash-wasm', '@zxcvbn-ts/core', 'ODC-BY', 'The Go Authors', '@fontsource-variable/instrument-sans', '@fontsource/ibm-plex-mono', 'Monero English mnemonic wordlist']) {
    assert.ok(notices.includes(name), `Missing attribution: ${name}`);
    assert.ok(file.includes(name), `Offline attribution missing: ${name}`);
  }
});
