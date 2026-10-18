import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Exercise all real pending fragments in isolation, without bumping this branch.
const root = await mkdtemp(join(tmpdir(), 'legal-real-version-'));
const execute = promisify(execFile);
try {
  for (const file of [
    'package.json',
    'package-lock.json',
    'CHANGELOG.md',
    '.prettierrc',
  ]) {
    await copyFile(file, join(root, file));
  }
  await cp('.changeset', join(root, '.changeset'), { recursive: true });
  await mkdir(join(root, 'node_modules'));
  await symlink(
    resolve('node_modules/prettier'),
    join(root, 'node_modules/prettier'),
    'junction'
  );
  await mkdir(join(root, 'node_modules/.bin'));
  await writeFile(
    join(root, 'node_modules/.bin/prettier'),
    '#!/bin/sh\nexec node "$(dirname "$0")/../prettier/bin/prettier.cjs" "$@"\n',
    { mode: 0o755 }
  );
  await writeFile(
    join(root, 'node_modules/.bin/prettier.cmd'),
    '@echo off\r\nnode "%~dp0..\\prettier\\bin\\prettier.cjs" %*\r\n'
  );
  const version = await execute(
    'node',
    [resolve('node_modules/@changesets/cli/bin.js'), 'version'],
    {
      cwd: root,
      env: {
        ...process.env,
        npm_config_offline: 'true',
        npm_config_yes: 'false',
      },
    }
  );
  console.log(version.stdout);
  const lock = await execute(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    [
      'install',
      '--package-lock-only',
      '--ignore-scripts',
      '--legacy-peer-deps',
      '--offline',
      '--no-audit',
      '--no-fund',
    ],
    { cwd: root }
  );
  console.log(lock.stdout);
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const metadata = JSON.parse(
    await readFile(join(root, 'package-lock.json'), 'utf8')
  );
  if (
    metadata.version !== pkg.version ||
    metadata.packages[''].version !== pkg.version
  ) {
    throw new Error('Versioned package and npm lock disagree');
  }
  console.log(
    JSON.stringify({
      package: pkg.name,
      version: pkg.version,
      lockSynchronized: true,
    })
  );
} catch (error) {
  console.error(error.stdout ?? '', error.stderr ?? '');
  throw error;
} finally {
  await rm(join(root, 'node_modules/prettier'), { force: true });
  await rm(root, { recursive: true, force: true });
}
