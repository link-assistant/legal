import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const upstream = {
  repository: 'link-assistant/formal-ai',
  commit: 'fd5bfaced85262a51b341fb2b25c79e507423ca3',
  path: 'js/agentic/crate/relative_meta_logic.mjs',
  sha256: '332217acd917fb61fc58cbe8e2762eb6166ab055a4c9f63c1e10c1eb8e2b1a25',
};
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'src/generated/formal-ai-relative.mjs');
const patch = resolve(root, 'patches/formal-ai/legal-context.patch');

// Apply only exact unified patches; refuse silently drifting upstream code.
export function applyExactPatch(source, diff) {
  const lines = source.split('\n');
  const patchLines = diff.replaceAll('\r\n', '\n').split('\n');
  let delta = 0;
  for (let i = 0; i < patchLines.length; i++) {
    const hunk = patchLines[i].match(
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
    );
    if (!hunk) {
      continue;
    }
    const old = [],
      replacement = [];
    for (
      i++;
      i < patchLines.length && !/^(?:@@|---|\+\+\+)/.test(patchLines[i]);
      i++
    ) {
      const line = patchLines[i];
      if (line[0] === ' ' || line[0] === '-') {
        old.push(line.slice(1));
      }
      if (line[0] === ' ' || line[0] === '+') {
        replacement.push(line.slice(1));
      }
    }
    i--;
    const start = Number(hunk[1]) - 1 + delta;
    if (lines.slice(start, start + old.length).join('\n') !== old.join('\n')) {
      throw new Error('Formal AI patch context mismatch');
    }
    lines.splice(start, old.length, ...replacement);
    delta += replacement.length - old.length;
  }
  return lines.join('\n');
}

export async function bootstrapFormalAI({ sourceFile } = {}) {
  const diff = await readFile(patch, 'utf8');
  const stamp = createHash('sha256')
    .update(JSON.stringify(upstream) + diff)
    .digest('hex');
  try {
    if (
      (await readFile(output, 'utf8')).startsWith(
        `// legal-bootstrap ${stamp}\n`
      )
    ) {
      return output;
    }
  } catch {
    /* First build. */
  }
  const raw = sourceFile
    ? await readFile(sourceFile, 'utf8')
    : await (async () => {
        const url = `https://raw.githubusercontent.com/${upstream.repository}/${upstream.commit}/${upstream.path}`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) {
          throw new Error(`Formal AI download: HTTP ${response.status}`);
        }
        return response.text();
      })();
  if (createHash('sha256').update(raw).digest('hex') !== upstream.sha256) {
    throw new Error('Formal AI source integrity mismatch');
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    `// legal-bootstrap ${stamp}\n${applyExactPatch(raw, diff)}`
  );
  return output;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(await bootstrapFormalAI({ sourceFile: process.argv[2] }));
}
