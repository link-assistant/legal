import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
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
for (const file of ['index.html', 'style.css']) {
  await copyFile(`web/${file}`, `dist/legal-demo/${file}`);
}
await copyFile('data/demo/corpus.json', 'dist/legal-demo/corpus.json');
console.log('Built dist/legal-demo');
