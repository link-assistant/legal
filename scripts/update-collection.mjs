import { readFile } from 'node:fs/promises';
import { updateCollection } from '../src/legal/schedule.js';
const config = JSON.parse(
  await readFile(process.argv[2] ?? 'examples/collection/config.json', 'utf8')
);
const result = await updateCollection(config);
console.log(JSON.stringify(result, null, 2));
if (result.results.some((item) => item.status === 'partial')) {
  process.exitCode = 2;
}
