import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist/legal-demo', { recursive: true });
await build({
  entryPoints: ['web/app.js'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: 'dist/legal-demo/app.js',
  minify: true,
  legalComments: 'eof',
});
await writeFile(
  'dist/legal-demo/index.html',
  (await readFile('web/index.html', 'utf8')).replace(
    '../data/demo/corpus.json',
    'corpus.json'
  )
);
await copyFile('web/style.css', 'dist/legal-demo/style.css');
await copyFile('data/demo/corpus.json', 'dist/legal-demo/corpus.json');
console.log('Built dist/legal-demo');
