import { expect } from 'test-anywhere';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
import { itUnless, sandboxed } from './helpers/skip.js';

itUnless(sandboxed)(
  'assembles the real pending changesets for the renamed legal package',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'legal-release-'));
    try {
      await copyFile('package.json', join(root, 'package.json'));
      await mkdir(join(root, '.changeset'));
      const files = (await readdir('.changeset')).filter(
        (file) =>
          file === 'config.json' ||
          (file.endsWith('.md') && file !== 'README.md')
      );
      for (const file of files) {
        await copyFile(
          join('.changeset', file),
          join(root, '.changeset', file)
        );
      }
      const execute = promisify(execFile);
      await execute('git', ['init', '--initial-branch=main'], { cwd: root });
      await execute(
        'git',
        [
          '-c',
          'user.name=Release fixture',
          '-c',
          'user.email=fixture@example.test',
          'commit',
          '--allow-empty',
          '-m',
          'Initialize release fixture',
        ],
        { cwd: root }
      );
      const output = join(root, 'plan.json');
      await promisify(execFile)(
        'node',
        [
          resolve('node_modules/@changesets/cli/bin.js'),
          'status',
          '--output',
          output,
        ],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 20000,
        }
      );
      const plan = JSON.parse(await readFile(output, 'utf8'));
      const pkg = JSON.parse(await readFile('package.json', 'utf8'));
      expect(plan.releases.length).toBe(1);
      expect(plan.releases[0].name).toBe(pkg.name);
      expect(plan.changesets.length).toBe(
        files.filter((file) => file.endsWith('.md')).length
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
);
