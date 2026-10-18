import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const repos = [
  'deep-foundation/russian-laws-bot',
  'deep-foundation/russian-laws',
  'konard/russian-law',
  'konard/deep-foundation-russian-laws-bot',
  'konard/deep-foundation-russian-laws',
  'link-foundation/russian-laws',
  'link-foundation/russian-laws-bot',
  'Svetozar-Technologies/indian-law',
  'Svetozar-Technologies/SatyaVera',
  'link-assistant/formal-ai',
  'link-foundation/meta-language',
  'link-foundation/links-notation',
  'link-foundation/lino-objects-codec',
];
const root = 'docs/case-studies/issue-1/data/upstream';
mkdirSync(root, { recursive: true });
for (const repo of repos) {
  const name = repo.replaceAll('/', '--');
  const gh = (args) =>
    execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  try {
    const info = JSON.parse(gh(['api', `repos/${repo}`]));
    writeFileSync(
      `${root}/${name}.json`,
      JSON.stringify(
        {
          full_name: info.full_name,
          description: info.description,
          license: info.license,
          default_branch: info.default_branch,
          updated_at: info.updated_at,
        },
        null,
        2
      )
    );
    const sha = JSON.parse(
      gh(['api', `repos/${repo}/commits/${info.default_branch}`])
    ).sha;
    const tree = JSON.parse(
      gh(['api', `repos/${repo}/git/trees/${sha}?recursive=1`])
    );
    writeFileSync(
      `${root}/${name}-tree.json.gz`,
      gzipSync(
        JSON.stringify({ sha, paths: tree.tree.map((x) => x.path) }, null, 2)
      )
    );
    try {
      writeFileSync(
        `${root}/${name}-README.md`,
        gh([
          'api',
          `repos/${repo}/readme`,
          '-H',
          'Accept: application/vnd.github.raw+json',
        ])
      );
    } catch {
      /* Optional upstream metadata may be absent. */
    }
    try {
      writeFileSync(
        `${root}/${name}-prs.json`,
        gh([
          'pr',
          'list',
          '--repo',
          repo,
          '--state',
          'merged',
          '--limit',
          '5',
          '--json',
          'number,title,url,mergedAt',
        ])
      );
    } catch {
      /* Optional upstream metadata may be absent. */
    }
    console.log(repo, sha, tree.tree.length);
  } catch (e) {
    console.log(repo, e.message);
  }
}
