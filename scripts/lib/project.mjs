import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

export async function readProject() {
  return JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
}

export function releaseEntry(changelog, version) {
  if (!versionPattern.test(version)) throw new Error('Expected a semantic application version.');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const header = new RegExp(`^## \\[${escaped}\\] - (\\d{4}-\\d{2}-\\d{2})\\r?$`, 'm');
  const match = changelog.match(header);
  if (!match) throw new Error(`CHANGELOG.md needs a dated entry for ${version}.`);
  const body = changelog
    .slice(match.index + match[0].length)
    .split(/^## /m, 1)[0]
    .trim();
  if (!body) throw new Error(`The ${version} changelog entry is empty.`);
  return { date: match[1], body };
}
