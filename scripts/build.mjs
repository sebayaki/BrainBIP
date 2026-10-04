import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, readProject } from './lib/project.mjs';
import { createNotices } from './lib/notices.mjs';

const root = projectRoot;
const project = await readProject();
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
      path: path.resolve(resolveDir, workerPath.slice(0, -7)),
      namespace: 'inline-worker',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'inline-worker' }, async ({ path: workerPath }) => {
      const result = await build({ ...config, entryPoints: [workerPath] });
      Object.keys(result.metafile.inputs).forEach((input) => usedInputs.add(input));
      return {
        contents: `export default ${JSON.stringify(result.outputFiles[0].text)};`,
        loader: 'js',
      };
    });
  },
};

const result = await build({ ...config, entryPoints: ['src/app.js'], plugins: [workerPlugin] });
Object.keys(result.metafile.inputs).forEach((input) => usedInputs.add(input));
const script = result.outputFiles[0].text;
const styleResult = await build({
  ...config,
  entryPoints: ['src/styles.css'],
  loader: { '.woff2': 'dataurl' },
});
Object.keys(styleResult.metafile.inputs).forEach((input) => usedInputs.add(input));
const styles = styleResult.outputFiles[0].text;
if (/<\/script/i.test(script) || /<\/style/i.test(styles))
  throw new Error('Unsafe inline asset boundary.');

const { notices, packageCount } = await createNotices(usedInputs, root);
const escapeHTML = (text) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const hash = (text, encoding = 'base64') => createHash('sha256').update(text).digest(encoding);
const csp = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  `script-src 'sha256-${hash(script)}' 'wasm-unsafe-eval'`,
  `style-src 'sha256-${hash(styles)}'`,
  'worker-src blob:',
  'img-src data:',
  'font-src data:',
  "connect-src 'none'",
].join('; ');
let template = await readFile(path.join(root, 'src/index.html'), 'utf8');
for (const [marker, content] of [
  [
    '<!-- APP_METADATA -->',
    `<meta name="application-name" content="BrainBIP"><meta name="application-version" content="${escapeHTML(project.version)}">`,
  ],
  ['<!-- APP_VERSION -->', `v${escapeHTML(project.version)}`],
  ['<!-- CSP -->', `<meta http-equiv="Content-Security-Policy" content="${escapeHTML(csp)}">`],
  ['<!-- APP_STYLES -->', `<style>${styles}</style>`],
  ['<!-- APP_SCRIPT -->', `<script>${script}</script>`],
  [
    '<!-- THIRD_PARTY -->',
    `<details class="licenses"><summary>Open-source licenses</summary><pre>${escapeHTML(notices)}</pre></details>`,
  ],
]) {
  if (template.split(marker).length !== 2) throw new Error(`Expected exactly one ${marker}.`);
  template = template.replace(marker, () => content);
}
const dist = path.join(root, 'dist');
const files = new Map([
  ['index.html', template],
  ['brainbip.html', template],
  ['VERSION.json', JSON.stringify({ name: 'BrainBIP', version: project.version }, null, 2) + '\n'],
  ['THIRD_PARTY_NOTICES.txt', notices],
  ['LICENSE', await readFile(path.join(root, 'LICENSE'), 'utf8')],
  ['social-card.png', await readFile(path.join(root, 'assets/social-card.png'))],
  [
    'sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHTML(project.homepage)}</loc></url></urlset>\n`,
  ],
]);
const checksums = [...files]
  .map(([name, content]) => `${hash(content, 'hex')}  ${name}\n`)
  .join('');
// dist is generated output; start clean so stale files cannot enter a release.
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const [name, content] of files) await writeFile(path.join(dist, name), content);
await writeFile(path.join(dist, '.nojekyll'), '');
await writeFile(path.join(dist, 'SHA256SUMS.txt'), checksums);
console.log(
  `Built BrainBIP ${project.version}: ${(Buffer.byteLength(template) / 1024).toFixed(0)} KiB, ${packageCount} bundled packages.`,
);
