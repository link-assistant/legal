import { expect } from 'test-anywhere';
import { itUnless, sandboxed } from './helpers/skip.js';
import { pendingReleasePlan } from './helpers/pending-release.js';

itUnless(sandboxed)(
  'assembles the real pending changesets for the renamed legal package',
  async () => {
    const { plan, pkg, fragments } = await pendingReleasePlan();
    const hasReleases = plan.changesets.some(
      (fragment) => fragment.releases.length > 0
    );
    expect(plan.releases.map((release) => release.name)).toEqual(
      hasReleases ? [pkg.name] : []
    );
    expect(plan.changesets.length).toBe(fragments.length);
  }
);
