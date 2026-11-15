const encoder = new TextEncoder();
const limit = 10000;

// These deliberately bounded grammars identify citation syntax, not legal meaning.
// Lists, ranges, relative context and other grammars are not interpreted.
const patterns = [
  {
    expression:
      /(?<![\p{L}\p{M}\p{N}_])(?<unit>Article|Section|paragraph)\.?[ \t\u00a0]{1,8}(?<identifier>\p{Nd}{1,8}(?:\.\p{Nd}{1,8}){0,3}[a-z]?|[ivxlcdm]{1,12})(?<subdivisions>(?:\([\p{Nd}a-z]{1,8}\)){0,4})(?![\p{L}\p{M}\p{N}_(])/giu,
    units: { article: 'article', section: 'section', paragraph: 'paragraph' },
  },
  {
    expression:
      /(?<![\p{L}\p{M}\p{N}_])(?<unit>статья|статьи|статье|статью|статьей|статьёй|მუხლი|अनुच्छेद|धारा)[ \t\u00a0]{1,8}(?<identifier>\p{Nd}{1,8}(?:\.\p{Nd}{1,8}){0,3})(?![\p{L}\p{M}\p{N}_(])/giu,
    units: {
      статья: 'article',
      статьи: 'article',
      статье: 'article',
      статью: 'article',
      статьей: 'article',
      статьёй: 'article',
      მუხლი: 'article',
      अनुच्छेद: 'article',
      धारा: 'section',
    },
  },
  {
    expression:
      /第(?<identifier>[零〇一二三四五六七八九十百千万\d]{1,12})(?<unit>条|章|节)/gu,
    units: { 条: 'article', 章: 'chapter', 节: 'section' },
  },
  {
    expression:
      /(?<unit>§)[ \t\u00a0]{0,8}(?<identifier>\p{Nd}{1,8}(?:\.\p{Nd}{1,8}){0,3}[a-z]?)(?<subdivisions>(?:\([\p{Nd}a-z]{1,8}\)){0,4})(?![\p{L}\p{M}\p{N}_(])/giu,
    units: { '§': 'section' },
  },
];

function mentions(law) {
  const found = [];
  for (const section of law.sections) {
    const firstContent = section.text.search(/\S/u);
    for (const { expression, units } of patterns) {
      for (const match of section.text.matchAll(expression)) {
        const { identifier, subdivisions = '', unit } = match.groups;
        // A word composed of Roman-numeral letters is not necessarily a number.
        if (
          /^[a-z]+$/i.test(identifier) &&
          !/^(?=[mdclxvi])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/i.test(
            identifier
          )
        ) {
          continue;
        }
        if (found.length >= limit) {
          throw new RangeError(
            'Reference extraction exceeds 10000 mentions; split the law'
          );
        }
        found.push({
          sectionId: section.id,
          start: section.start + match.index,
          end: section.start + match.index + match[0].length,
          quote: match[0],
          role:
            match.index === firstContent
              ? 'heading-candidate'
              : 'reference-candidate',
          target: {
            unit: units[unit.toLowerCase()],
            identifier,
            subdivisions: [
              ...subdivisions.matchAll(/\(([\p{Nd}a-z]{1,8})\)/giu),
            ].map((part) => part[1]),
          },
        });
      }
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

const targetKey = ({ unit, identifier }) =>
  `${unit}:${identifier.toLowerCase()}`;

export function extractLawReferences(law) {
  const found = mentions(law);
  const headings = new Map();
  for (const mention of found) {
    if (mention.role === 'heading-candidate') {
      const key = targetKey(mention.target);
      const candidates = headings.get(key) ?? { ids: [], count: 0 };
      candidates.count++;
      if (candidates.ids.length < 16) {
        candidates.ids.push(mention.sectionId);
      }
      headings.set(key, candidates);
    }
  }
  let cursor = 0;
  let byteCursor = 0;
  return found.map((mention, index) => {
    // Byte offsets advance through disjoint text spans in one pass.
    byteCursor += encoder.encode(law.text.slice(cursor, mention.start)).length;
    const byteStart = byteCursor;
    byteCursor += encoder.encode(mention.quote).length;
    cursor = mention.end;
    const candidates = headings.get(targetKey(mention.target));
    return {
      id: `${law.id}:ref${index + 1}`,
      lawId: law.id,
      contentHash: law.contentHash,
      url: law.url,
      ...mention,
      byteStart,
      byteEnd: byteCursor,
      localCandidates: [...(candidates?.ids ?? [])],
      localCandidateCount: candidates?.count ?? 0,
      candidatesTruncated: (candidates?.count ?? 0) > 16,
      verified: false,
      semantics: 'citation-syntax-only',
    };
  });
}
