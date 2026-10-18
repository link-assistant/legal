import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Exercise a packed artifact from a clean consumer directory, without install scripts.
const root = await mkdtemp(join(tmpdir(), 'legal-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command, args, cwd) =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
try {
  const packed = run(
    npm,
    ['pack', '--json', '--pack-destination', root],
    process.cwd()
  );
  const archive = join(
    root,
    JSON.parse(packed.slice(packed.indexOf('[\n')))[0].filename
  );
  await writeFile(join(root, 'package.json'), '{}\n');
  run(
    npm,
    [
      'install',
      '--ignore-scripts',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      archive,
    ],
    root
  );
  const consumer = `import { add, answerQuestion } from '@link-assistant/legal';
import { loadCorpus } from '@link-assistant/legal/server';
const corpus = await loadCorpus();
const result = answerQuestion(corpus.laws, 'equal before the law', {jurisdiction:'GE'});
if (add(2,3)!==5 || result.status !== 'sources-found' || !result.citations.length) throw new Error('Package library smoke failed');
for (const citation of result.citations) {
  const law = corpus.laws.find(item => item.id === citation.lawId);
  if (law.text.slice(citation.start,citation.end) !== citation.quote) throw new Error('Package citation mismatch');
}
console.log('Packed library and bundled corpus passed');`;
  await writeFile(join(root, 'consumer.mjs'), consumer);
  console.log(run(process.execPath, ['consumer.mjs'], root).trim());
  const metadata = JSON.parse(
    await readFile(
      join(root, 'node_modules/@link-assistant/legal/package.json'),
      'utf8'
    )
  );
  const cli = join(
    root,
    'node_modules/@link-assistant/legal',
    metadata.bin['legal-assistant']
  );
  const answer = JSON.parse(
    run(
      process.execPath,
      [cli, 'ask', 'equal before the law', '--jurisdiction', 'GE'],
      root
    )
  );
  if (!answer.citations.length) {
    throw new Error('Packed CLI smoke failed');
  }
  console.log('Packed CLI passed outside the repository');
} finally {
  await rm(root, { recursive: true, force: true });
}
