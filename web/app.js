import { answerQuestion } from '../src/legal/assistant.js';
import { buildCoverage } from '../src/legal/registry.js';
import { normalizeLaw } from '../src/legal/model.js';
import { formalizeLaw, encodeKnowledge } from '../src/legal/formalize.js';
const byId = (id) => document.getElementById(id);
let laws = [];
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) {
    element.textContent = text;
  }
  if (className) {
    element.className = className;
  }
  return element;
};
function link(text, url) {
  const element = node('a', text);
  element.href = url;
  element.target = '_blank';
  element.rel = 'noopener noreferrer';
  return element;
}
function downloadLaw(law) {
  const blob = new Blob([encodeKnowledge(formalizeLaw(law))], {
    type: 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = link('', url);
  anchor.download = `${law.id}.lino`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderCollection(corpus) {
  if (
    corpus.schemaVersion !== 1 ||
    !Array.isArray(corpus.laws) ||
    corpus.laws.length > 1000
  ) {
    throw new Error('Expected a version 1 corpus with at most 1000 records');
  }
  const selected = corpus.laws.map((record) => {
    const law = normalizeLaw(record);
    if (record.contentHash !== law.contentHash) {
      throw new Error('Corpus content checksum mismatch');
    }
    return law;
  });
  laws = selected;
  for (const [id, values] of [
    ['jurisdiction', laws.map((law) => law.jurisdiction)],
    ['language', laws.map((law) => law.language)],
  ]) {
    const select = byId(id);
    select.replaceChildren(new Option('All collected', ''));
    for (const value of [...new Set(values)].sort()) {
      select.add(new Option(value, value));
    }
  }
  byId('document-count').textContent = `${laws.length} source records`;
  byId('coverage').replaceChildren(
    ...buildCoverage(laws).jurisdictions.map((item) => {
      const row = node('div', undefined, 'coverage-row');
      row.append(
        node('span', item.name),
        node(
          'span',
          item.documents ? `${item.documents} · sample` : 'Not collected'
        )
      );
      return row;
    })
  );
  byId('documents').replaceChildren(
    ...laws.map((law) => {
      const row = node('article', undefined, 'document-row');
      const text = node('div');
      text.append(
        node('h3', law.title),
        node(
          'p',
          `${law.jurisdiction} / ${law.language} · ${law.text.length.toLocaleString()} characters · ${law.status}`
        )
      );
      const button = node('button', 'Export formalization ↓');
      button.type = 'button';
      button.addEventListener('click', () => downloadLaw(law));
      row.append(text, button);
      return row;
    })
  );
  search();
}
function renderCitation(citation) {
  const article = node('article', undefined, 'result');
  article.append(
    node(
      'span',
      `${citation.jurisdiction} / ${citation.language} · ${citation.label}`,
      'tag'
    ),
    node('h3', citation.title),
    node('blockquote', citation.quote)
  );
  const refs = node('div', undefined, 'citation');
  refs.append(
    link('Official source ↗', citation.url),
    node('span', `Collected ${citation.retrievedAt.slice(0, 10)}`)
  );
  article.append(refs);
  const evidence = node('details');
  evidence.append(
    node('summary', 'Verify this quotation'),
    node('p', `SHA-256 ${citation.contentHash}`),
    node(
      'p',
      `Normalized text offsets ${citation.start}–${citation.end}; UTF-8 bytes ${citation.byteStart}–${citation.byteEnd}. Edition status: ${citation.status}.`
    )
  );
  article.append(evidence);
  return article;
}
function search() {
  const results = byId('results');
  try {
    const answer = answerQuestion(laws, byId('question').value, {
      jurisdiction: byId('jurisdiction').value || undefined,
      language: byId('language').value || undefined,
      limit: 4,
    });
    results.replaceChildren(
      node(
        'p',
        `${answer.citations.length} source matches · exact quotations`,
        'result-summary'
      ),
      ...answer.citations.map(renderCitation)
    );
    if (!answer.citations.length) {
      results.append(
        node(
          'p',
          'The collected texts have insufficient evidence for these words. Try the source language or another collection.',
          'empty'
        )
      );
    }
  } catch (error) {
    results.replaceChildren(node('p', error.message, 'empty'));
  }
}
byId('question-form').addEventListener('submit', (event) => {
  event.preventDefault();
  search();
});
for (const id of ['jurisdiction', 'language']) {
  byId(id).addEventListener('change', search);
}
for (const button of document.querySelectorAll('[data-query]')) {
  button.addEventListener('click', () => {
    byId('question').value = button.dataset.query;
    search();
  });
}
byId('corpus-file').addEventListener('change', async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    if (file.size > 10000000) {
      throw new Error('Corpus file exceeds the 10 MB browser limit');
    }
    renderCollection(JSON.parse(await file.text()));
    byId('upload-status').textContent = 'Corpus loaded and checksums verified.';
  } catch (error) {
    byId('upload-status').textContent = error.message;
  }
});
try {
  const response = await fetch('./corpus.json');
  if (!response.ok) {
    throw new Error('Collection unavailable');
  }
  renderCollection(await response.json());
} catch (error) {
  byId('results').textContent = error.message;
}
