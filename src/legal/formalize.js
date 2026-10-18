import { LinkNetwork } from 'meta-language';
import { encode, decode } from 'lino-objects-codec';
import { Parser } from 'links-notation';

// Modal cues describe the text. They are never promoted to executable legal rules.
const cues = [
  [
    'prohibition',
    /\b(?:shall not|must not|may not|prohibited)\b|не (?:допускается|может)|запрещ|不得|禁止|აკრძალულია|नहीं करेगा/iu,
  ],
  [
    'permission',
    /\b(?:may|permitted|entitled|right to)\b|вправе|имеет право|有权|შეუძლია|अधिकार/iu,
  ],
  [
    'obligation',
    /\b(?:shall|must|required)\b|обязан|должен|应当|必须|ვალდებულია|करेगा/iu,
  ],
];
const qualifierCues = [
  'unless',
  'except',
  'subject to',
  'provided that',
  'если',
  'кроме',
  '除外',
  '但',
  'გარდა',
  'यदि',
];
export const encodeKnowledge = (value) => encode({ obj: value });
export const decodeKnowledge = (notation) => decode({ notation });

export function formalizeLaw(law) {
  // Process bounded sections to keep the lossless meta-language network small.
  const networks = [];
  const claims = [];
  const reconstructed = law.sections
    .map((section) => {
      for (let start = 0; start < section.text.length; start += 16000) {
        const chunk = section.text.slice(start, start + 16000);
        const network = LinkNetwork.parseLosslessText(
          chunk,
          `legal-${law.language}`
        );
        const rebuilt = network.reconstructText();
        if (rebuilt !== chunk) {
          throw new Error('meta-language reconstruction mismatch');
        }
        networks.push({
          sectionId: section.id,
          start: section.start + start,
          end: section.start + start + chunk.length,
          links: network.toLino(),
        });
      }
      const pattern = /[^。！？.!?\n]+[。！？.!?]?/gu;
      for (const match of section.text.matchAll(pattern)) {
        const quote = match[0];
        if (!quote.trim()) {
          continue;
        }
        const lower = quote.toLowerCase();
        claims.push({
          id: `${section.id}:c${claims.length + 1}`,
          sectionId: section.id,
          quote,
          start: section.start + match.index,
          end: section.start + match.index + quote.length,
          modality:
            cues.find(([, regex]) => regex.test(quote))?.[0] ?? 'statement',
          qualifiers: qualifierCues.filter((cue) => lower.includes(cue)),
          verified: false,
          semantics: 'surface-cue-only',
        });
      }
      return section.text;
    })
    .join('');
  const value = {
    schemaVersion: 1,
    lawId: law.id,
    contentHash: law.contentHash,
    language: law.language,
    reconstructed,
    roundTrip: reconstructed === law.text,
    networks,
    claims,
    limits: [
      'Lossless syntax is verified; legal meaning, exceptions and applicability are not proved.',
    ],
  };
  // Verify the actual interchange parser accepts what we publish.
  new Parser().parse(
    encodeKnowledge({ lawId: law.id, contentHash: law.contentHash })
  );
  return value;
}
