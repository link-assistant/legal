import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { robotsAllowed, robotsIntervalMs } from '../src/legal/collector.js';
import { setTimeout as pause } from 'node:timers/promises';

// Finite research only: three origins, one robots and one document each.
const targets = [
  ['in-language', 'https://rajbhasha.gov.in/en/constitutional-provisions'],
  [
    'in-constitution',
    'https://lddashboard.legislative.gov.in/sites/default/files/coi/COI_2024.pdf',
  ],
  ['eu-eli', 'https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng'],
];
const root = 'experiments/official/alternatives';
await mkdir(root, { recursive: true });
function fetchBytes(url) {
  return execFileSync(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--max-time',
      '20',
      '--max-filesize',
      '5000000',
      '--max-redirs',
      '0',
      '--user-agent',
      'LegalAssistant/0.1 (+https://github.com/link-assistant/legal)',
      url,
    ],
    { maxBuffer: 5100000 }
  );
}
for (const [id, url] of targets) {
  try {
    const robots = fetchBytes(`${new URL(url).origin}/robots.txt`);
    await writeFile(`${root}/${id}-robots.txt`, robots);
    if (!robotsAllowed(robots.toString(), url)) {
      console.log(JSON.stringify({ id, url, status: 'robots-disallowed' }));
      continue;
    }
    await pause(Math.max(1500, robotsIntervalMs(robots.toString())));
    const bytes = fetchBytes(url);
    await writeFile(`${root}/${id}.raw`, bytes);
    console.log(
      JSON.stringify({
        id,
        url,
        bytes: bytes.length,
        prefix: bytes.toString().slice(0, 80),
      })
    );
  } catch (error) {
    console.log(JSON.stringify({ id, url, error: error.message }));
  }
}
