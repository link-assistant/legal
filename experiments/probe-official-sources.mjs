import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const urls = {
  us: 'https://uscode.house.gov/download/download.shtml',
  eu: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679',
  cn: 'https://flk.npc.gov.cn/',
  in: 'https://www.indiacode.nic.in/handle/123456789/1526?view_type=browse',
  ru: 'https://publication.pravo.gov.ru/api/Documents?pageSize=2&index=1',
  ge: 'https://matsne.gov.ge/en/document/view/30346',
};
mkdirSync('experiments/official', { recursive: true });
for (const [key, url] of Object.entries(urls)) {
  try {
    const body = execFileSync(
      'curl',
      [
        '-L',
        '--retry',
        '1',
        '--max-time',
        '50',
        '--max-filesize',
        '5000000',
        '-A',
        'LegalAssistantResearch/0.1 (+https://github.com/link-assistant/legal)',
        '-sS',
        url,
      ],
      { maxBuffer: 6 * 1024 * 1024 }
    );
    writeFileSync(`experiments/official/${key}.raw`, body);
    console.log(key, body.length, body.toString().slice(0, 100));
  } catch (e) {
    console.log(key, e.message);
  }
}
