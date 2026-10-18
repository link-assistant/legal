// Verify fresh generation with LF/CRLF patches, without the checkout's cache.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { upstream } from '../scripts/bootstrap-formal-ai.mjs';

const root = await mkdtemp(join(tmpdir(), 'legal-bootstrap-platforms-'));
const run = (command, args) => {
  const execution = promisify(execFile)(command, args, {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  execution.child.stdin.end();
  return execution;
};
try {
  const url = `https://raw.githubusercontent.com/${upstream.repository}/${upstream.commit}/${upstream.path}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  const source = await response.text();
  assert.equal(
    createHash('sha256').update(source).digest('hex'),
    upstream.sha256
  );
  const sourcePath = join(root, 'upstream.mjs');
  await writeFile(sourcePath, source);
  const patch = (
    await readFile('patches/formal-ai/legal-context.patch', 'utf8')
  ).replaceAll('\r\n', '\n');
  const outputs = [];
  for (const [name, runtime, crlf] of [
    ['lf-node', 'node', false],
    ['crlf-node', 'node', true],
    ['crlf-deno', 'deno', true],
  ]) {
    const directory = join(root, name);
    await mkdir(join(directory, 'scripts'), { recursive: true });
    await mkdir(join(directory, 'patches/formal-ai'), { recursive: true });
    const script = join(directory, 'scripts/bootstrap-formal-ai.mjs');
    await copyFile(resolve('scripts/bootstrap-formal-ai.mjs'), script);
    await writeFile(
      join(directory, 'patches/formal-ai/legal-context.patch'),
      crlf ? patch.replaceAll('\n', '\r\n') : patch
    );
    await run(
      runtime,
      runtime === 'deno'
        ? ['run', '-A', script, sourcePath]
        : [script, sourcePath]
    );
    const output = join(directory, 'src/generated/formal-ai-relative.mjs');
    const generated = await readFile(output, 'utf8');
    outputs.push(generated);
    if (runtime === 'deno') {
      await run('deno', ['check', output]);
    }
    const hash = createHash('sha256').update(generated).digest('hex');
    console.log(`${name}: fresh generation passed, SHA-256 ${hash}`);
  }
  assert.equal(outputs[0], outputs[1]);
  assert.equal(outputs[0], outputs[2]);
  console.log(
    'All three fresh builds are byte-identical; upstream hash unchanged.'
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
