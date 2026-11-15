// Fills edition hashes into hand-written evaluation cases from the demo corpus.
// Expected answers and proofs were written by reading the collected source
// text; they are not lawyer-reviewed. Run: node experiments/author-evaluation-cases.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const corpus = JSON.parse(readFileSync('data/demo/corpus.json', 'utf8'));
const path = 'data/evaluation/questions.json';
const set = JSON.parse(readFileSync(path, 'utf8'));
for (const item of set.cases) {
  const { expected } = item;
  if (expected.status !== 'sources-found') {
    continue;
  }
  const law = corpus.laws.find(
    (record) =>
      record.id === expected.lawId &&
      record.sections.some(
        (section) =>
          section.id === expected.sectionId &&
          section.text.includes(expected.proof)
      )
  );
  if (!law) {
    throw new Error(`Proof not found for ${item.id}`);
  }
  expected.contentHash = law.contentHash;
}
writeFileSync(path, `${JSON.stringify(set, null, 2)}\n`);
console.log(`hashed ${set.cases.length} cases`);
