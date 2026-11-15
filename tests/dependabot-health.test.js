import assert from 'node:assert/strict';
import { describe, expect, it } from 'test-anywhere';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  REBASE_BANNER,
  escapeCommand,
  findStuck,
  listPulls,
  main,
} from '../scripts/check-dependabot-health.mjs';
import { HttpError } from '../scripts/github-api.mjs';

const NOW = new Date('2026-11-14T00:00:00Z');
const DAY_MS = 86400000;

function pull({
  age = 0,
  banners = 0,
  login = 'dependabot[bot]',
  state = 'open',
  number = 135,
  now = NOW,
} = {}) {
  return {
    state,
    user: { login },
    number,
    created_at: new Date(now.getTime() - age * DAY_MS).toISOString(),
    body: REBASE_BANNER.repeat(banners),
  };
}

function pages(...batches) {
  const calls = [];
  const request = async (method, path) => {
    calls.push(`${method} ${path}`);
    const page = Number(new URL(path, 'https://x').searchParams.get('page'));
    return batches[page - 1] ?? [];
  };
  return { calls, request };
}

describe('Dependabot health thresholds', () => {
  for (const [age, banners, stuck] of [
    [0, 0, false],
    [14, 2, false],
    [14 + 1 / 86400, 0, true],
    [0, 3, true],
    [15, 4, true],
    [-1, 0, false],
  ]) {
    it(`age ${age} days with ${banners} banners is ${stuck ? '' : 'not '}stuck`, () => {
      const result = findStuck([pull({ age, banners })], { now: NOW });
      expect(result.length > 0).toBe(stuck);
      if (age === 15) {
        expect(result[0].reasons.length).toBe(2);
      }
    });
  }

  it('ignores closed PRs, other authors and missing users', () => {
    const pulls = [
      pull({ age: 99, state: 'closed' }),
      pull({ age: 99, login: 'user' }),
      { ...pull({ age: 99 }), user: null },
    ];
    expect(findStuck(pulls, { now: NOW })).toEqual([]);
  });

  it('accepts a null body and custom thresholds', () => {
    expect(findStuck([{ ...pull(), body: null }], { now: NOW })).toEqual([]);
    expect(
      findStuck([pull({ age: 4 })], { now: NOW, maxOpenDays: 3 }).length
    ).toBe(1);
    expect(
      findStuck([pull({ banners: 1 })], { now: NOW, maxRebaseBanners: 0 })
        .length
    ).toBe(1);
  });

  for (const created of ['bad', '2026-01-01T00:00:00']) {
    it(`rejects the timestamp ${created}`, () => {
      expect(() =>
        findStuck([{ ...pull(), created_at: created }], { now: NOW })
      ).toThrow();
    });
  }
});

describe('Dependabot health API scan', () => {
  it('inspects every page of open PRs', async () => {
    const first = Array.from({ length: 100 }, (_, i) => pull({ number: i }));
    const { calls, request } = pages(first, [pull({ age: 99, number: 101 })]);
    const pulls = await listPulls('owner/repo', request);
    expect(pulls.length).toBe(101);
    expect(findStuck(pulls, { now: NOW })[0].pull.number).toBe(101);
    expect(calls).toEqual([
      'GET /repos/owner/repo/pulls?state=open&per_page=100&page=1',
      'GET /repos/owner/repo/pulls?state=open&per_page=100&page=2',
    ]);
  });

  it('treats an empty repository as healthy', async () => {
    expect(await listPulls('owner/repo', pages().request)).toEqual([]);
  });

  for (const data of [{}, null, [null], [1]]) {
    it(`fails on the malformed page ${JSON.stringify(data)}`, async () => {
      await assert.rejects(listPulls('owner/repo', async () => data));
    });
  }

  it('validates the repository before calling the API', async () => {
    const { calls, request } = pages();
    await assert.rejects(
      listPulls('owner/repo?injected', request),
      /owner\/repository/
    );
    expect(calls).toEqual([]);
  });
});

describe('Dependabot health report', () => {
  function run(options) {
    let output = '';
    return main({
      argv: [],
      env: { GITHUB_REPOSITORY: 'owner/repo' },
      now: NOW,
      write: (text) => {
        output += text;
      },
      ...options,
    }).then((code) => ({ code, output }));
  }

  for (const stuck of [false, true]) {
    it(`exits ${Number(stuck)} and summarizes when ${stuck ? 'a PR is' : 'no PR is'} stuck`, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'dependabot-health-'));
      try {
        const summary = join(dir, 'summary.md');
        writeFileSync(summary, 'previous summary\n');
        const { code, output } = await run({
          env: {
            GITHUB_REPOSITORY: 'owner/repo',
            GITHUB_STEP_SUMMARY: summary,
          },
          request: pages([pull({ age: stuck ? 15 : 0 })]).request,
        });
        expect(code).toBe(Number(stuck));
        expect(output).toContain(`${Number(stuck)} stuck`);
        expect(readFileSync(summary, 'utf8')).toMatch(
          /^previous summary\nDependabot health:/
        );
        if (stuck) {
          expect(output).toContain(
            '::error title=Stuck Dependabot pull request::#135'
          );
          expect(output).toContain('https://github.com/owner/repo/pull/135');
          expect(output).toContain('fix/merge');
          expect(output).toContain('close obsolete');
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  for (const error of [
    new HttpError(403, 'Forbidden', { method: 'GET', path: '/repos' }),
    new Error('fetch failed'),
  ]) {
    it(`fails visibly when the scan throws ${error.message}`, async () => {
      const { code, output } = await run({
        request: async () => {
          throw error;
        },
      });
      expect(code).toBe(1);
      expect(output).toContain('::error title=Dependabot health scan failed::');
    });
  }

  it('rejects unknown and non-numeric arguments', async () => {
    for (const argv of [
      ['--bogus', '1'],
      ['constructor', '1'],
      ['--max-open-days', '-1'],
    ]) {
      const { code, output } = await run({ argv, request: pages().request });
      expect(code).toBe(1);
      expect(output).toContain('Unknown or invalid argument');
    }
  });

  it('prints debug output only when opted in', async () => {
    const quiet = await run({ request: pages().request });
    expect(quiet.output).not.toContain('debug');
    const loud = await run({
      env: { GITHUB_REPOSITORY: 'owner/repo', DEPENDABOT_HEALTH_DEBUG: '1' },
      request: pages().request,
    });
    expect(loud.output).toContain('Dependabot health debug: fetched page 1');
  });

  it('escapes workflow commands in API text', () => {
    expect(escapeCommand('a%b\r\n::error::x')).toBe('a%25b%0D%0A::error::x');
  });
});

describe('Dependabot configuration', () => {
  const config = parse(readFileSync('.github/dependabot.yml', 'utf8'));

  it('waits a week before proposing a release in every ecosystem', () => {
    for (const update of config.updates) {
      expect(update.cooldown?.['default-days']).toBe(7);
      expect(Object.keys(update.groups ?? {}).length).toBe(1);
    }
  });

  it('covers GitHub Actions and the npm lockfiles without a Deno lock', () => {
    const covered = config.updates.map(
      (update) => `${update['package-ecosystem']} ${update.directory}`
    );
    expect(covered).toEqual([
      'github-actions /',
      'npm /examples/universal-app',
      'npm /.github/actions/artifact-transport',
    ]);
  });

  it('runs the health scan on a schedule and its own tests on PRs', () => {
    const workflow = parse(
      readFileSync('.github/workflows/dependabot-health.yml', 'utf8')
    );
    expect(Object.keys(workflow.on).sort()).toEqual(
      ['pull_request', 'schedule', 'workflow_dispatch'].sort()
    );
    expect(workflow.on.pull_request.paths).toContain(
      'scripts/check-dependabot-health.mjs'
    );
    const steps = workflow.jobs.health.steps;
    const scan = steps.find((step) =>
      String(step.run).includes('check-dependabot-health.mjs')
    );
    expect(scan.if).toBe("github.event_name != 'pull_request'");
  });
});
