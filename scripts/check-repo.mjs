import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readProject, releaseEntry, versionPattern } from './lib/project.mjs';

const project = await readProject();
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
assert.match(project.version, versionPattern, 'Use a semantic application version.');
assert.equal(lock.version, project.version, 'Lockfile version must match package.json.');
assert.equal(lock.packages[''].version, project.version, 'Root package lock version must match.');
for (const field of ['dependencies', 'devDependencies']) {
  assert.deepEqual(lock.packages[''][field], project[field], `${field} must match the lockfile.`);
  for (const [name, version] of Object.entries(project[field])) {
    assert.match(version, versionPattern, `Pin an exact version for ${name}.`);
  }
}
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
releaseEntry(changelog, project.version);
const latest = changelog.match(/^## \[(\d[^\]]*)\] - /m)?.[1];
assert.equal(latest, project.version, 'The newest changelog entry must match package.json.');
assert.equal(project.license, 'MIT');
assert.equal(project.private, true, 'This project ships an HTML file, not an npm package.');
console.log(`Repository metadata is consistent: BrainBIP ${project.version}.`);
