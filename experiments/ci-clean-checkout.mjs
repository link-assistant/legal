// Reproduce CI's detached checkout without a local main branch, using local data.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const mode = process.argv[2] ?? 'release';
assert.ok(
  ['release', 'released', 'deno-before', 'deno', 'windows'].includes(mode)
);
const root = await mkdtemp(join(tmpdir(), 'legal-detached-release-'));
try {
  await execute('git', [
    'clone',
    '--quiet',
    '--single-branch',
    '--branch',
    'issue-1-c88ef43ecd12',
    resolve('.'),
    root,
  ]);
  await execute('git', ['checkout', '--quiet', '--detach', 'HEAD'], {
    cwd: root,
  });
  const refs = await execute('git', ['for-each-ref', '--format=%(refname)'], {
    cwd: root,
  });
  assert.ok(!refs.stdout.split('\n').includes('refs/heads/main'));
  // Overlay the current test draft so the same command verifies an uncommitted fix.
  for (const path of [
    'tests/changeset-config.test.js',
    'tests/legal-release.test.js',
    'tests/helpers',
    'scripts/bootstrap-formal-ai.mjs',
    '.github/workflows/release.yml',
  ]) {
    await cp(path, join(root, path), { recursive: true });
  }
  await symlink(
    resolve('node_modules'),
    join(root, 'node_modules'),
    'junction'
  );
  if (mode === 'released') {
    const fragments = join(root, '.changeset');
    for (const file of await readdir(fragments)) {
      if (file.endsWith('.md') && file !== 'README.md') {
        await rm(join(fragments, file));
      }
    }
  }
  let command = process.execPath;
  let args = [
    '--test',
    '--test-timeout=30000',
    '--test-name-pattern=assembles the real pending',
    'tests/changeset-config.test.js',
    'tests/legal-release.test.js',
  ];
  if (mode === 'windows') {
    const patch = join(root, 'patches/formal-ai/legal-context.patch');
    await writeFile(
      patch,
      (await readFile(patch, 'utf8'))
        .replaceAll('\r\n', '\n')
        .replaceAll('\n', '\r\n')
    );
    args = ['scripts/bootstrap-formal-ai.mjs'];
  } else if (mode.startsWith('deno')) {
    command = 'deno';
    args = ['check', 'src/legal/assistant.js'];
    if (mode === 'deno') {
      const workflow = await readFile(
        join(root, '.github/workflows/release.yml'),
        'utf8'
      );
      assert.ok(
        workflow.includes('run: deno run -A scripts/bootstrap-formal-ai.mjs')
      );
      const bootstrap = await execute(
        'deno',
        ['run', '-A', 'scripts/bootstrap-formal-ai.mjs'],
        { cwd: root }
      );
      console.log(bootstrap.stdout);
    }
  }
  console.log(`Clean detached checkout without main: ${mode}`);
  const run = execute(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  run.child.stdin.end();
  try {
    const { stdout, stderr } = await run;
    console.log(stdout);
    if (stderr) {
      console.error(stderr);
    }
  } catch (error) {
    console.error(error.stdout, error.stderr);
    throw error;
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
