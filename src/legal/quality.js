// Deterministic extracted-text screening. It detects decoding damage and text
// whose letters are not in the scripts expected for its declared language. It
// is a screening gate, not reviewed OCR or a proof that the text is accurate.
const singleScript = {
  Latin:
    'en es fr de it pt nl pl cs sk sl hr hu ro fi et lv lt mt ga sv da tr sq is no nb nn lb za krl vep',
  Cyrillic:
    'ru bg uk be mk kk ky tg ab ady alt av ba bua ce chm cv dar inh kbd krc kum kv lbe lez mdf mhr myv nog os rut sah tab tt tyv udm xal',
  Devanagari: 'hi mr ne sa mai doi brx kok',
};
const languageScripts = new Map([
  ...Object.entries(singleScript).flatMap(([script, languages]) =>
    languages.split(' ').map((language) => [language, [script]])
  ),
  ['sr', ['Cyrillic', 'Latin']],
  ['bs', ['Latin', 'Cyrillic']],
  ['az', ['Latin']],
  ['mn', ['Mongolian', 'Cyrillic']],
  ['el', ['Greek']],
  ['ka', ['Georgian']],
  ['hy', ['Armenian']],
  ['zh', ['Han']],
  ['ko', ['Hangul', 'Han']],
  ['bo', ['Tibetan']],
  ['ii', ['Yi']],
  ['ug', ['Arabic']],
  ['ur', ['Arabic']],
  ['ks', ['Arabic', 'Devanagari']],
  ['sd', ['Arabic', 'Devanagari']],
  ['bn', ['Bengali']],
  ['as', ['Bengali']],
  ['mni', ['Bengali', 'Meetei_Mayek']],
  ['gu', ['Gujarati']],
  ['kn', ['Kannada']],
  ['ml', ['Malayalam']],
  ['ta', ['Tamil']],
  ['te', ['Telugu']],
  ['or', ['Oriya']],
  ['pa', ['Gurmukhi']],
  ['sat', ['Ol_Chiki']],
]);

const checks = [
  ['replacement-character', /�/gu],
  ['private-use-character', /\p{Co}/gu],
  ['control-character', /(?![\t\n\r])\p{Cc}/gu],
  ['unassigned-code-point', /\p{Cn}/gu],
  // UTF-8 bytes decoded as Windows-1252/Latin-1, such as "\u00C3\u00A9" for "\u00E9".
  [
    'utf8-as-latin1',
    /[\u00C2\u00C3\u00D0\u00D1][\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u2013-\u203A\u20AC\u2122]|\u00E2\u20AC/gu,
  ],
];

export function expectedScripts(language) {
  return languageScripts.get(String(language).toLowerCase().split('-')[0]);
}

export function assessTextQuality(
  text,
  language,
  { minScriptShare = 0.6 } = {}
) {
  if (typeof text !== 'string') {
    throw new Error('Text must be a string');
  }
  const issues = [];
  for (const [code, pattern] of checks) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length) {
      issues.push({
        code,
        count: matches.length,
        firstOffset: matches[0].index,
      });
    }
  }
  const letters = text.match(/\p{L}/gu) ?? [];
  const allowed = expectedScripts(language);
  let share = null;
  if (allowed && letters.length) {
    const pattern = new RegExp(
      allowed.map((script) => `\\p{Script=${script}}`).join('|'),
      'u'
    );
    share =
      letters.filter((letter) => pattern.test(letter)).length / letters.length;
    if (share < minScriptShare) {
      issues.push({ code: 'script-mismatch', share: Number(share.toFixed(4)) });
    }
  }
  if (!letters.length) {
    issues.push({ code: 'no-letters' });
  }
  return {
    language,
    expectedScripts: allowed ?? null,
    letters: letters.length,
    expectedScriptShare: share === null ? null : Number(share.toFixed(4)),
    status: issues.length
      ? 'needs-review'
      : allowed
        ? 'screened'
        : 'script-unassessed',
    issues,
    reviewed: false,
    limits: [
      'Screening detects decoding damage and script mismatch only. It does not verify OCR, spelling, completeness or legal accuracy.',
    ],
  };
}

export function assessCorpusQuality(laws, options) {
  const records = laws.map((law) => ({
    lawId: law.id,
    language: law.language,
    contentHash: law.contentHash,
    ...assessTextQuality(law.text, law.language, options),
  }));
  return {
    complete: false,
    records,
    summary: {
      records: records.length,
      screened: records.filter((item) => item.status === 'screened').length,
      needsReview: records.filter((item) => item.status === 'needs-review')
        .length,
      scriptUnassessed: records.filter(
        (item) => item.status === 'script-unassessed'
      ).length,
    },
  };
}
