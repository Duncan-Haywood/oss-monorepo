/**
 * What origin is the published site actually served under?
 *
 * WHY THIS EXISTS
 *
 * `.github/workflows/browser-checks-ci.yml` is the only automated run of the
 * seven checks that open a real browser, and `journey.mjs` inside it is the
 * only thing that reads a built page's `rel="canonical"`, its `sitemap.xml`
 * entries and a share link back out and asserts they name the site's own
 * origin. To do that the workflow has to tell the build which origin that is,
 * which it did with a literal:
 *
 *     --stamp-base-url https://tools.marisstella.dev/
 *
 * That was a correct reading of the intended origin when it was written, and
 * it is the exact shape CLAUDE.md records paying for twice: a fact about a
 * live configuration, restated as a constant, with nothing that re-runs when
 * the world moves. It moved. `tools.marisstella.dev` has refused connections
 * on :443 since 2026-09-04 (`Outage triage` run 33889983086 -- the k3s API
 * server itself is not listening), and the catalogue has been served since
 * 2026-09-06 by GitHub Pages off the `gh-pages` branch, whose artifact
 * carries `https://duncan-haywood.github.io/monorepo-projects/` in every
 * canonical tag and every `<loc>`.
 *
 * So the nightly built, and verified, an artifact nobody publishes. Its
 * canonical/sitemap/share-link assertions all passed -- against a stamp that
 * made them self-consistent -- while the artifact real visitors and real
 * crawlers receive went unchecked on precisely the dimension this check
 * exists for. That is worse than not running: a green nightly is read as
 * "the published origin is sound".
 *
 * THE RULE, AND WHOSE RULE IT IS
 *
 * `platform/pages/publish-branch.sh` is the thing that actually publishes, so
 * it owns the answer. Its rule is two lines:
 *
 *   - a `CNAME` on the serving branch means the site answers at that host, so
 *     the base URL is `https://<cname>/` (`publish-branch.sh:184`);
 *   - otherwise the build's own `DEFAULT_BASE_URL` applies, which is where
 *     GitHub serves a project Pages site for this repository.
 *
 * This module answers the same question for readers that are not the
 * publisher -- today the nightly sweep. It **imports** `DEFAULT_BASE_URL`
 * from `build.mjs` rather than restating it, for the reason CLAUDE.md gives
 * under "168 became 169": the last constant copied out of `build.mjs` instead
 * of imported cost seven finished, tested pages their public route.
 *
 * WHAT IT WILL NOT DO
 *
 * Return a guess. If the serving branch is not in the clone at all, the
 * answer is the build default -- which is correct whenever no custom domain
 * is configured, and is a *guess* when one might be. Those two are reported
 * as different `source` values and the CLI says which on stderr, so a caller
 * that fetched the branch and a caller that could not are never handed the
 * same-looking answer. `actions/checkout` fetches one branch, so in CI the
 * second case is the default one unless the workflow fetches the serving
 * branch first -- which is why the workflow does.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BASE_URL } from './build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

/** The branch GitHub Pages serves. Matches `publish-branch.sh`'s `BRANCH`. */
export const SERVING_BRANCH = 'gh-pages';

/**
 * A CNAME GitHub cannot parse fails the domain over without saying so, which
 * is why `publish-branch.sh` refuses to publish one. It follows that a
 * malformed CNAME cannot legitimately be on the serving branch -- so finding
 * one here means something wrote that branch by another route, and stamping
 * *anything* would be a guess about where the site answers. Throw instead.
 */
function assertBareHostname(cname) {
  const bare = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
  if (!bare.test(cname)) {
    throw new Error(
      `the CNAME on '${SERVING_BRANCH}' is not a bare, fully-qualified hostname: ${JSON.stringify(cname)}. ` +
        'publish-branch.sh refuses to publish one of these, so this branch was written by another route; ' +
        'fix the CNAME rather than stamping a guessed origin.',
    );
  }
}

function defaultGit(repoRoot) {
  return (args) =>
    execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
}

/**
 * Read the serving branch's CNAME, or null when the branch is not in the
 * clone or carries no CNAME. The ref preference order is the one
 * `publish-branch.sh:131` uses: a local branch first, then the tracking ref.
 *
 * Returns `{ cname, branchSeen }` so the caller can tell "no custom domain"
 * (branch present, no CNAME -- a real answer) from "branch not in this clone"
 * (no answer at all). Collapsing those two is the only way this function
 * could return a confident wrong origin.
 */
export function readServingCname({ repoRoot = REPO_ROOT, branch = SERVING_BRANCH, git } = {}) {
  const run = git ?? defaultGit(repoRoot);
  let branchSeen = false;
  for (const ref of [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]) {
    try {
      run(['rev-parse', '--verify', '--quiet', ref]);
    } catch {
      continue;
    }
    branchSeen = true;
    let contents;
    try {
      contents = run(['show', `${ref}:CNAME`]);
    } catch {
      // The branch exists and has no CNAME: a real "no custom domain".
      return { cname: null, branchSeen };
    }
    const cname = contents.split('\n', 1)[0].replace(/\s/g, '');
    return { cname: cname === '' ? null : cname, branchSeen };
  }
  return { cname: null, branchSeen };
}

/**
 * The origin the published site is served under.
 *
 * `source` is the part callers must not throw away:
 *   - `cname`            a custom domain is configured; this is measured.
 *   - `project-pages`    the serving branch was read and carries no custom
 *                        domain, so the project Pages URL is the answer.
 *   - `assumed-default`  the serving branch is not in this clone, so this is
 *                        the build default and *not* a reading. Correct when
 *                        no custom domain exists; a guess otherwise.
 */
export function publishedBaseUrl(opts = {}) {
  const { cname, branchSeen } = readServingCname(opts);
  if (cname !== null) {
    assertBareHostname(cname);
    return { baseUrl: `https://${cname}/`, source: 'cname', cname };
  }
  return {
    baseUrl: DEFAULT_BASE_URL,
    source: branchSeen ? 'project-pages' : 'assumed-default',
    cname: null,
  };
}

const NOTE = {
  cname: (r) => `custom domain on ${SERVING_BRANCH}: ${r.cname}`,
  'project-pages': () => `${SERVING_BRANCH} carries no CNAME, so the project Pages URL is the origin`,
  'assumed-default': () =>
    `'${SERVING_BRANCH}' is not in this clone, so this is the build default and NOT a reading of the ` +
    `published site; fetch that branch first if a custom domain may be configured`,
};

// stdout is the URL and nothing else, so a caller can use it directly. The
// provenance goes to stderr, where it is visible in a CI log without becoming
// part of the value.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = publishedBaseUrl();
  process.stderr.write(`published base URL: ${result.baseUrl} (${NOTE[result.source](result)})\n`);
  process.stdout.write(`${result.baseUrl}\n`);
}
