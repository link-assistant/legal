import { execFile } from 'node:child_process';
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

// Changesets status resolves baseBranch even when reading all pending fragments.
// Supply an isolated remote base ref, with no local main even in the fixture.
export async function pendingReleasePlan() {
  const root = await mkdtemp(join(tmpdir(), 'legal-release-'));
  const execute = promisify(execFile);
  try {
    await copyFile('package.json', join(root, 'package.json'));
    await mkdir(join(root, '.changeset'));
    await copyFile(
      '.changeset/config.json',
      join(root, '.changeset/config.json')
    );
    const files = (await readdir('.changeset')).filter(
      (file) => file.endsWith('.md') && file !== 'README.md'
    );
    const git = async (...args) => {
      const execution = execute(
        'git',
        [
          '-c',
          'user.name=Release fixture',
          '-c',
          'user.email=fixture@example.test',
          '-c',
          'commit.gpgsign=false',
          ...args,
        ],
        { cwd: root, encoding: 'utf8', timeout: 10000 }
      );
      execution.child.stdin.end();
      await execution;
    };
    await git('init', '--initial-branch=ci-check');
    await git('add', '.');
    await git('commit', '-m', 'Release fixture base');
    await git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    for (const file of files) {
      await copyFile(join('.changeset', file), join(root, '.changeset', file));
    }
    await git('add', '.');
    await git('commit', '--allow-empty', '-m', 'Actual pending fragments');
    await git('checkout', '--detach');
    const output = join(root, 'plan.json');
    const execution = execute(
      'node',
      [
        resolve('node_modules/@changesets/cli/bin.js'),
        'status',
        '--since=origin/main',
        '--output',
        output,
      ],
      { cwd: root, encoding: 'utf8', timeout: 20000 }
    );
    execution.child.stdin.end();
    await execution;
    return {
      plan: JSON.parse(await readFile(output, 'utf8')),
      pkg: JSON.parse(await readFile('package.json', 'utf8')),
      fragments: files.filter((file) => file.endsWith('.md')),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
