#!/usr/bin/env node
/**
 * Report Dependabot pull requests that are stuck even though Dependabot's own
 * scheduled runs succeed: a PR open longer than the age limit, or one whose
 * body keeps collecting "Dependabot is rebasing this PR" banners.
 *
 * Usage:
 *   GITHUB_REPOSITORY=owner/repo GH_TOKEN=... node scripts/check-dependabot-health.mjs
 *   node scripts/check-dependabot-health.mjs --repo owner/repo --max-open-days 14
 *   DEPENDABOT_HEALTH_DEBUG=1 node scripts/check-dependabot-health.mjs ...
 *
 * Exit status 1 means a maintainer has work to do (or the scan failed); every
 * stuck PR is printed as an `::error` annotation with its link.
 */
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { describe as describeError, githubApi } from './github-api.mjs';

export const REBASE_BANNER = 'Dependabot is rebasing this PR';
const BOT_LOGIN = 'dependabot[bot]';
const DAY_MS = 86400000;
const PAGE_SIZE = 100;

/** Keep API text from injecting GitHub workflow commands. */
export function escapeCommand(text) {
  return String(text)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

function parseCreated(pull) {
  const created = String(pull.created_at ?? '');
  // An offset-less timestamp would be read as local time and skew the age.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(created)) {
    throw new Error(`PR #${pull.number} has a timestamp without a timezone`);
  }
  const time = Date.parse(created);
  if (Number.isNaN(time)) {
    throw new Error(`PR #${pull.number} has an invalid timestamp`);
  }
  return time;
}

/**
 * Select open Dependabot PRs exceeding either independent threshold.
 * @returns {{pull: object, reasons: string[]}[]}
 */
export function findStuck(
  pulls,
  { now, maxOpenDays = 14, maxRebaseBanners = 2 }
) {
  const stuck = [];
  for (const pull of pulls) {
    if (pull.state !== 'open' || pull.user?.login !== BOT_LOGIN) {
      continue;
    }
    const ageMs = now.getTime() - parseCreated(pull);
    const reasons = [];
    if (ageMs > maxOpenDays * DAY_MS) {
      reasons.push(
        `open for ${(ageMs / DAY_MS).toFixed(2)} days (limit ${maxOpenDays})`
      );
    }
    const banners = String(pull.body ?? '').split(REBASE_BANNER).length - 1;
    if (banners > maxRebaseBanners) {
      reasons.push(
        `${banners} unfinished rebase banners (limit ${maxRebaseBanners})`
      );
    }
    if (reasons.length) {
      stuck.push({ pull, reasons });
    }
  }
  return stuck;
}

/** Fetch every open-PR page; API errors must never look like healthy scans. */
export async function listPulls(repository, request, log = () => {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('Set GITHUB_REPOSITORY or --repo to owner/repository');
  }
  const pulls = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(
      'GET',
      `/repos/${repository}/pulls?state=open&per_page=${PAGE_SIZE}&page=${page}`
    );
    if (!Array.isArray(batch)) {
      throw new Error('GitHub returned an invalid pull-request page');
    }
    if (batch.some((pull) => !pull || typeof pull !== 'object')) {
      throw new Error('GitHub returned an invalid pull-request record');
    }
    pulls.push(...batch);
    log(`fetched page ${page}: ${batch.length} open PRs`);
    if (batch.length < PAGE_SIZE) {
      return pulls;
    }
  }
}

function parseArgs(argv, env) {
  const args = {
    repo: env.GITHUB_REPOSITORY || '',
    maxOpenDays: 14,
    maxRebaseBanners: 2,
  };
  const numeric = {
    '--max-open-days': 'maxOpenDays',
    '--max-rebase-banners': 'maxRebaseBanners',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--repo' && value !== undefined) {
      args.repo = value;
    } else if (Object.hasOwn(numeric, flag) && /^\d+$/.test(value ?? '')) {
      args[numeric[flag]] = Number(value);
    } else {
      throw new Error(`Unknown or invalid argument: ${flag}`);
    }
    index += 1;
  }
  return args;
}

function defaultRequest(env) {
  return githubApi({
    token: env.GH_TOKEN || env.GITHUB_TOKEN || '',
    apiUrl: env.GITHUB_API_URL || undefined,
  });
}

/** Build the summary and one `::error` annotation per stuck PR. */
export function formatReport(pulls, stuck, { repo, server }) {
  const own = pulls.filter((pull) => pull.user?.login === BOT_LOGIN).length;
  const lines = [
    `Dependabot health: ${own} open Dependabot PR(s), ${stuck.length} stuck.`,
  ];
  const errors = [];
  for (const { pull, reasons } of stuck) {
    // Build the URL from the validated repository and a numeric PR ID only.
    const number = Number.parseInt(pull.number, 10);
    const detail = `#${number}: ${reasons.join('; ')} (${server}/${repo}/pull/${number})`;
    lines.push(`- ${detail}`);
    errors.push(
      `::error title=Stuck Dependabot pull request::${escapeCommand(detail)}\n`
    );
  }
  if (stuck.length) {
    lines.push(
      'Review the failing checks and fix/merge current updates, or close obsolete PRs so Dependabot can propose fresh updates.'
    );
  }
  return { report: `${lines.join('\n')}\n`, errors };
}

/**
 * Run the scan and return the exit status.
 * @param {{argv?: string[], env?: Record<string, string|undefined>, request?: Function, now?: Date, write?: (text: string) => void}} options
 */
export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  request,
  now = new Date(),
  write = (text) => process.stdout.write(text),
} = {}) {
  try {
    const args = parseArgs(argv, env);
    const debug =
      env.DEPENDABOT_HEALTH_DEBUG === '1'
        ? (message) => write(`Dependabot health debug: ${message}\n`)
        : () => {};
    const pulls = await listPulls(
      args.repo,
      request ?? defaultRequest(env),
      debug
    );
    const stuck = findStuck(pulls, { now, ...args });
    const { report, errors } = formatReport(pulls, stuck, {
      repo: args.repo,
      server: env.GITHUB_SERVER_URL || 'https://github.com',
    });
    for (const error of errors) {
      write(error);
    }
    write(report);
    if (env.GITHUB_STEP_SUMMARY) {
      appendFileSync(env.GITHUB_STEP_SUMMARY, report);
    }
    return stuck.length ? 1 : 0;
  } catch (error) {
    write(
      `::error title=Dependabot health scan failed::${escapeCommand(describeError(error))}\n`
    );
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}
