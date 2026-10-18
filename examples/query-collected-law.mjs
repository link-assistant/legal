import { readFile } from 'node:fs/promises';
import {
  normalizeLaw,
  answerQuestion,
  formalizeLaw,
} from '../src/legal/index.js';
const corpus = JSON.parse(
  await readFile(new URL('../data/demo/corpus.json', import.meta.url), 'utf8')
);
const laws = corpus.laws.map(normalizeLaw);
const answer = answerQuestion(laws, 'equal before the law', {
  jurisdiction: 'GE',
  language: 'en',
});
console.log(JSON.stringify(answer, null, 2));
const formal = formalizeLaw(laws[0]);
console.log('Lossless source round trip:', formal.roundTrip);
