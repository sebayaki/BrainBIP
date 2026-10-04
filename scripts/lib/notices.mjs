import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function createNotices(usedInputs, root) {
  const packageNames = [
    ...new Set(
      [...usedInputs].flatMap((input) => {
        const match = input.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/);
        return match ? [match[1]] : [];
      }),
    ),
  ].sort();
  let notices = 'BrainBIP — third-party notices\n\n';
  notices += `${await readFile(path.join(root, 'LICENSE'), 'utf8')}\n\n`;
  for (const name of packageNames) {
    const directory = path.join(root, 'node_modules', name);
    const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    notices += `${name} ${pkg.version}\n${'='.repeat(name.length + pkg.version.length + 1)}\n`;
    let found = false;
    for (const filename of [
      'LICENSE',
      'LICENSE.txt',
      'LICENSE.md',
      'NOTICE.md',
      'THIRD_PARTY_LICENSES.md',
    ]) {
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
  notices += `Monero English mnemonic wordlist\nSource: https://github.com/monero-project/monero/blob/master/src/mnemonics/english.h\n${await readFile(path.join(root, 'licenses/Monero-LICENSE'), 'utf8')}\n`;
  notices +=
    '\nBLAKE2 reference implementation: the CC0 license option is used.\nhttps://creativecommons.org/publicdomain/zero/1.0/\n';
  notices +=
    '\nEnglish frequency data from OpenSubtitles 2024 via OPUS / Helsinki-NLP is licensed under ODC-BY 1.0.\nLicense: https://opendatacommons.org/licenses/by/1-0/\nSource: https://opus.nlpl.eu/\n';
  return { notices, packageCount: packageNames.length };
}
