import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const usedInputs = new Set();
const config = {
  absWorkingDir: root,
  bundle: true,
  write: false,
  minify: true,
  charset: 'ascii',
  target: ['es2022'],
  platform: 'browser',
  format: 'iife',
  legalComments: 'none',
  sourcemap: false,
  metafile: true,
  supported: { 'inline-script': true },
};
const workerPlugin = {
  name: 'inline-workers',
  setup(builder) {
    builder.onResolve({ filter: /\?worker$/ }, ({ path: workerPath, resolveDir }) => ({
      path: path.resolve(resolveDir, workerPath.slice(0, -7)), namespace: 'inline-worker',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'inline-worker' }, async ({ path: workerPath }) => {
      const result = await build({ ...config, entryPoints: [workerPath] });
      Object.keys(result.metafile.inputs).forEach((input) => usedInputs.add(input));
      return { contents: `export default ${JSON.stringify(result.outputFiles[0].text)};`, loader: 'js' };
    });
  },
};

const result = await build({ ...config, entryPoints: ['src/app.js'], plugins: [workerPlugin] });
Object.keys(result.metafile.inputs).forEach((input) => usedInputs.add(input));
const script = result.outputFiles[0].text;
const styleResult = await build({ ...config, entryPoints: ['src/styles.css'] });
const styles = styleResult.outputFiles[0].text;
if (/<\/script/i.test(script) || /<\/style/i.test(styles)) throw new Error('Unsafe inline asset boundary.');

const packageNames = [...new Set([...usedInputs].flatMap((input) => {
  const match = input.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/);
  return match ? [match[1]] : [];
}))].sort();
let notices = 'BrainBIP — third-party notices\n\n';
notices += `${await readFile(path.join(root, 'LICENSE'), 'utf8')}\n\n`;
for (const name of packageNames) {
  const directory = path.join(root, 'node_modules', name);
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  notices += `${name} ${pkg.version}\n${'='.repeat(name.length + pkg.version.length + 1)}\n`;
  let found = false;
  for (const filename of ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'NOTICE.md', 'THIRD_PARTY_LICENSES.md']) {
    try {
      const contents = await readFile(path.join(directory, filename), 'utf8');
      notices += `${contents.trim()}\n\n`;
      if (filename.startsWith('LICENSE')) found = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (!found) throw new Error(`License not found for ${name}.`);
}
// hash-wasm embeds these C implementations in the included WASM modules.
for (const filename of ['argon2.c', 'blake2b.c', 'sha256.c', 'sha512.c']) {
  const source = await readFile(path.join(root, 'node_modules/hash-wasm/src', filename), 'utf8');
  const leadingNotice = source.match(/^\s*\/\*[\s\S]*?\*\//)?.[0];
  if (!leadingNotice) throw new Error(`Embedded source notice not found: ${filename}.`);
  notices += `hash-wasm/src/${filename}\n${leadingNotice.trim()}\n\n`;
}
notices += `Go crypto (upstream of the hash-wasm Argon2 implementation)\nSource: https://github.com/golang/crypto\n${await readFile(path.join(root, 'licenses/Go-LICENSE'), 'utf8')}\n`;
notices += '\nBLAKE2 reference implementation: the CC0 license option is used.\nhttps://creativecommons.org/publicdomain/zero/1.0/\n';
notices += '\nEnglish frequency data from OpenSubtitles 2024 via OPUS / Helsinki-NLP is licensed under ODC-BY 1.0.\nLicense: https://opendatacommons.org/licenses/by/1-0/\nSource: https://opus.nlpl.eu/\n';
const escapeHTML = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const hash = (text, encoding = 'base64') => createHash('sha256').update(text).digest(encoding);
const csp = [
  "default-src 'none'", "base-uri 'none'", "form-action 'none'", "object-src 'none'",
  `script-src 'sha256-${hash(script)}' 'wasm-unsafe-eval'`,
  `style-src 'sha256-${hash(styles)}'`, "worker-src blob:", "img-src data:", "connect-src 'none'",
].join('; ');
let template = await readFile(path.join(root, 'src/index.html'), 'utf8');
for (const [marker, content] of [
  ['<!-- CSP -->', `<meta http-equiv="Content-Security-Policy" content="${escapeHTML(csp)}">`],
  ['<!-- APP_STYLES -->', `<style>${styles}</style>`],
  ['<!-- APP_SCRIPT -->', `<script>${script}</script>`],
  ['<!-- THIRD_PARTY -->', `<details class="licenses"><summary>Open-source licenses</summary><pre>${escapeHTML(notices)}</pre></details>`],
]) {
  if (template.split(marker).length !== 2) throw new Error(`Expected exactly one ${marker}.`);
  template = template.replace(marker, () => content);
}
const dist = path.join(root, 'dist');
await mkdir(dist, { recursive: true });
await writeFile(path.join(dist, 'index.html'), template);
await writeFile(path.join(dist, 'brainbip.html'), template);
await writeFile(path.join(dist, 'THIRD_PARTY_NOTICES.txt'), notices);
await writeFile(path.join(dist, 'LICENSE'), await readFile(path.join(root, 'LICENSE')));
await writeFile(path.join(dist, '.nojekyll'), '');
await writeFile(path.join(dist, 'SHA256SUMS.txt'), `${hash(template, 'hex')}  index.html\n${hash(template, 'hex')}  brainbip.html\n`);
console.log(`Built standalone HTML: ${(Buffer.byteLength(template) / 1024).toFixed(0)} KiB, ${packageNames.length} bundled packages.`);
