// Reading a file out of git history, from a clone that may not have that history.
//
// `page-integrity.test.mjs` pins its checker against the exact blobs from the
// commits where two products shipped dead. That is the most valuable thing in
// the suite -- a guard proven against the real defect rather than a hand-written
// approximation -- and it is also the one thing that cannot run in a shallow
// clone, which is what every Claude-on-the-web session gets (50 commits,
// `git rev-parse --is-shallow-repository` -> true).
//
// Measured 2026-09-07: on a clean checkout of `main`, those two tests failed
// with `fatal: invalid object name '1a8feb3'`, and did so identically on the PR
// branch under review. That is CLAUDE.md's UNRUN lesson arriving from a new
// direction: a red that means "this clone does not carry the history" wearing
// the costume of a red that means "the checker stopped catching the defect".
// A session that reads it the first way waves through a real regression; one
// that reads it the second way burns the run chasing a bug that is not there.
// Either way `main` reads red for a reason that has nothing to do with `main`.
//
// So the discrimination this module makes is the same one `run_workflow_locally.py`
// makes between a missing interpreter and a missing repository module:
//
//   shallow clone + object absent  -> UNAVAILABLE. Skip, naming the remedy.
//   full clone + object absent     -> a real failure. The history this test
//                                     pins itself to is gone (rewritten, or the
//                                     test went stale). Never skip that.
//
// The second half is the half that matters. A skip that fires unconditionally
// would silently retire the suite's best test the first time someone rewrote a
// sha, which is strictly worse than the failure it replaces.

import { execFileSync } from 'node:child_process';

/** True when this working copy is a shallow clone (`--depth`), so old objects are absent by construction. */
export function isShallowClone(repo) {
  try {
    const out = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: repo,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return out === 'true';
  } catch {
    // Not a git work tree at all (an exported tarball, say). Treat that the same
    // as shallow: the history is absent for a reason that is not a defect here.
    return true;
  }
}

/**
 * Read `<rev>:<path>` out of git history.
 *
 * @returns {{ ok: true, content: string }}
 *   the blob, or
 * @returns {{ ok: false, reason: string }}
 *   when the object is absent *and* the clone is shallow, so the absence is the
 *   clone's rather than the repository's. `reason` names the remedy.
 * @throws when the object is absent in a full clone, or git fails for any other
 *   reason -- both are real failures the caller must not swallow.
 */
export function readHistoryBlob(repo, rev, path) {
  try {
    return {
      ok: true,
      content: execFileSync('git', ['show', `${rev}:${path}`], {
        cwd: repo,
        maxBuffer: 1 << 26,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).toString(),
    };
  } catch (err) {
    if (!isShallowClone(repo)) throw err;
    return {
      ok: false,
      reason:
        `${rev}:${path} is not in this clone, and this clone is shallow ` +
        `(git rev-parse --is-shallow-repository -> true). The blob exists in the ` +
        `repository's history; run \`git fetch --unshallow\` to run this check. ` +
        `Not a failure of the checker under test.`,
    };
  }
}
