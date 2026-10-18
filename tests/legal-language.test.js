import { it, expect } from 'test-anywhere';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeLaw } from '../src/legal/model.js';
import { createLegalServer } from '../src/legal/server.js';
import { runLegalCli } from '../bin/legal-assistant.js';

const corpus = {
  schemaVersion: 1,
  laws: ['en', 'ka'].map((language) =>
    normalizeLaw({
      id: 'synthetic-multilingual-act',
      jurisdiction: 'GE',
      language,
      title: 'Synthetic language selection fixture',
      text: language === 'en' ? 'English fixture text.' : 'ქართული ტექსტი.',
      url: `https://matsne.gov.ge/${language}/document/view/1`,
      retrievedAt: '2026-01-01T00:00:00Z',
    })
  ),
};

it('requires a language for ambiguous law details and formalization over HTTP', async () => {
  const server = createLegalServer({ corpus });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/v1/laws/synthetic-multilingual-act`;
    for (const suffix of ['', '/formalization']) {
      expect((await fetch(`${base}${suffix}`)).status).toBe(409);
      const selected = await fetch(`${base}${suffix}?language=ka`);
      expect(selected.status).toBe(200);
      expect((await selected.text()).includes('ქართული')).toBe(true);
      expect((await fetch(`${base}${suffix}?language=zh`)).status).toBe(404);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

it('requires CLI language selection when one law ID has multiple translations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legal-language-'));
  try {
    const path = join(root, 'corpus.json');
    await writeFile(path, JSON.stringify(corpus));
    const output = [],
      errors = [];
    const io = {
      stdout: (line) => output.push(line),
      stderr: (line) => errors.push(line),
    };
    const args = ['formalize', corpus.laws[0].id, '--corpus', path];
    expect(await runLegalCli(args, io)).toBe(1);
    expect(errors[0].includes('--language')).toBe(true);
    expect(await runLegalCli([...args, '--language', 'ka'], io)).toBe(0);
    expect(output.join('').includes('ქართული')).toBe(true);
    expect(await runLegalCli([...args, '--language', 'zh'], io)).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
