import { cp, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

// Exercise the actual tarball outside the checkout, with normal install scripts.
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
  // Pack a clean source fixture: a developer's cached generated module must
  // never hide a broken prepack/prepare hook. Keep the checkout untouched.
  const source = join(root, 'source');
  await mkdir(source);
  for (const path of [
    'package.json',
    'bin',
    'src',
    'data',
    'patches',
    'scripts',
    'docs/openapi.json',
    'CHANGELOG.md',
    'LICENSE',
    'README.md',
  ]) {
    await cp(path, join(source, path), {
      recursive: true,
      filter: (path) => !path.replaceAll('\\', '/').includes('src/generated'),
    });
  }
  const generated = join(source, 'src/generated/formal-ai-relative.mjs');
  await assert.rejects(readFile(generated), { code: 'ENOENT' });
  const packed = run(
    npm,
    ['pack', '--json', '--pack-destination', root],
    source
  );
  assert((await readFile(generated, 'utf8')).startsWith('// legal-bootstrap '));
  const [artifact] = JSON.parse(packed.slice(packed.indexOf('[\n')));
  const files = artifact.files.map((file) => file.path);
  assert(files.includes('src/generated/formal-ai-relative.mjs'));
  console.log(
    'Fresh npm pack generated and included the pinned Formal AI module'
  );
  for (const path of files) {
    assert(
      !/^(?:tests|experiments|\.github|collections|web)\//.test(path),
      path
    );
    assert(!path.includes('example-package-name'), path);
  }
  const archive = join(root, artifact.filename);
  await writeFile(join(root, 'package.json'), '{}\n');
  run(npm, ['install', '--omit=dev', '--no-audit', '--no-fund', archive], root);
  const consumer = `import { add, answerQuestion, extractLawReferences } from '@link-assistant/legal';
import { loadCorpus } from '@link-assistant/legal/server';
const corpus = await loadCorpus();
const result = answerQuestion(corpus.laws, 'equal before the law', {jurisdiction:'GE'});
if (add(2,3)!==5 || result.status !== 'sources-found' || !result.citations.length) throw new Error('Package library smoke failed');
for (const citation of result.citations) {
  const law = corpus.laws.find(item => item.id === citation.lawId);
  if (law.text.slice(citation.start,citation.end) !== citation.quote) throw new Error('Package citation mismatch');
}
const gdpr = corpus.laws.find(law => law.id === 'eu-gdpr-2016-article5-en');
const mentions = extractLawReferences(gdpr).filter(reference => reference.target.identifier === '89');
if (mentions.length !== 2 || mentions.some(reference => reference.verified || reference.localCandidateCount || reference.contentHash !== gdpr.contentHash)) throw new Error('Packed reference evidence mismatch');
console.log('Packed library and bundled corpus passed');`;
  await writeFile(join(root, 'consumer.mjs'), consumer);
  console.log(run(process.execPath, ['consumer.mjs'], root).trim());
  const metadata = JSON.parse(
    await readFile(
      join(root, 'node_modules/@link-assistant/legal/package.json'),
      'utf8'
    )
  );
  assert(!JSON.stringify(metadata).includes('example-package-name'));
  assert.equal(metadata.version, artifact.version);
  const bin = join(
    root,
    'node_modules/.bin',
    `legal${process.platform === 'win32' ? '.cmd' : ''}`
  );
  assert.equal(run(bin, ['--version'], root).trim(), metadata.version);
  assert.equal(run(bin, ['multiply', '6', '7'], root).trim(), '42');
  // npm installs must also work when dependency lifecycle scripts are disabled.
  const prefix = join(root, 'global');
  run(
    npm,
    [
      'install',
      '-g',
      '--prefix',
      prefix,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      archive,
    ],
    root
  );
  const globalBin =
    process.platform === 'win32'
      ? join(prefix, 'legal.cmd')
      : join(prefix, 'bin/legal');
  assert.equal(run(globalBin, ['--version'], root).trim(), metadata.version);
  console.log(
    `Packed legal --version: ${metadata.version} (local and global npm shims)`
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
