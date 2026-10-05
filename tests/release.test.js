import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { readProject, releaseEntry, versionPattern } from '../scripts/lib/project.mjs';

test('release notes include only the selected version and reject missing or invalid versions', () => {
  const changelog =
    '# Changelog\n\n## [Unreleased]\nFuture work.\n\n## [0.2.0] - 2026-10-04\n\nReleased changes.\n\n## [0.1.0] - 2026-09-30\n\nOlder changes.\n';
  assert.deepEqual(releaseEntry(changelog, '0.2.0'), {
    date: '2026-10-04',
    body: 'Released changes.',
  });
  assert.throws(() => releaseEntry(changelog, '0.3.0'), /dated entry/);
  assert.throws(() => releaseEntry(changelog, '0x2x0'), /semantic/);
  assert.throws(() => releaseEntry('## [0.2.0] - 2026-10-04\n', '0.2.0'), /empty/);
  for (const version of ['0.2.0', '1.0.0', '0.3.0-rc.1']) assert.match(version, versionPattern);
  for (const version of ['v0.2.0', '00.2.0', '0.2', '0.2.0-01', '0.2.0+build'])
    assert.doesNotMatch(version, versionPattern);
});

test('release command validates the exact tag and produces reviewable notes without publishing', async () => {
  const project = await readProject();
  const script = new URL('../scripts/release.mjs', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const notes = execFileSync(
    process.execPath,
    [fileURLToPath(script), 'notes', `v${project.version}`],
    { encoding: 'utf8' },
  );
  assert.match(notes, /## Downloads/);
  assert.match(notes, /brainbip\.html/);
  assert.doesNotMatch(notes, /index\.html/);
  assert.match(notes, /brainbip-v2/);
  assert.ok(
    notes.includes(
      releaseEntry(
        await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
        project.version,
      ).body,
    ),
  );
  const mismatch = spawnSync(process.execPath, [fileURLToPath(script), 'check', 'v999.0.0'], {
    encoding: 'utf8',
  });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /must match package.json/);
});
