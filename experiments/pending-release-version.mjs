// Exercise the actual pending fragments without consuming the checkout's files.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const directory = await mkdtemp(join(tmpdir(), 'legal-pending-release-'));
try {
  for (const path of [
    'package.json',
    'package-lock.json',
    'deno.json',
    'deno.lock',
    'CHANGELOG.md',
    '.prettierrc',
    '.changeset',
    'scripts',
    'patches',
    'src/generated',
  ]) {
    await cp(path, join(directory, path), { recursive: true });
  }
  await symlink(resolve('node_modules'), join(directory, 'node_modules'));
  const execution = promisify(execFile)(
    process.execPath,
    ['scripts/changeset-version.mjs'],
    {
      cwd: directory,
      env: { ...process.env, CI: 'true', DEBUG: '1' },
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    }
  );
  execution.child.stdin.end();
  const { stdout, stderr } = await execution;
  console.log(stdout);
  if (stderr) {
    console.error(stderr);
  }
  const pkg = JSON.parse(await readFile(join(directory, 'package.json')));
  const lock = JSON.parse(await readFile(join(directory, 'package-lock.json')));
  assert.equal(pkg.name, '@link-assistant/legal');
  assert.equal(pkg.version, '0.12.0');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  console.log(`Real pending release and synchronized lock: ${pkg.version}`);
} catch (error) {
  console.error(error.stdout, error.stderr);
  throw error;
} finally {
  await rm(directory, { recursive: true, force: true });
}
