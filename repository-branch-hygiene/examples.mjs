// The worked example behind "Load a worked example".
//
// Chosen so one click shows all six classifications at once. A visitor arriving
// from a search result has no snapshot of their own yet — the example is the
// only path this product has to first value inside ten seconds, so it has to
// demonstrate the distinction the tool exists to make, not just parse cleanly.
//
// The interesting rows are the two that look safe and are not:
//
//   feature/rebased-after-merge  its PR merged, but the local tip was moved
//                                afterwards, so the tip is NOT in the base
//                                history and deleting it would drop those
//                                commits. Classified `moved-tip`, not `merged`.
//   hotfix/cherry-pick-a/-b      two refs at one commit. Deleting "the
//                                duplicate" can orphan whichever one another
//                                person is actually using.
//
// Commit ids are short and readable on purpose; real snapshots carry full
// 40-character SHAs and the classifier does not care which it gets.

export const EXAMPLE_SNAPSHOT = {
  default_branch: 'main',
  protected_branches: ['main', 'release/2026-08'],
  branches: [
    { name: 'main', tip: 'm4', commits: ['m4', 'm3', 'm2', 'm1'] },
    { name: 'release/2026-08', tip: 'r1', commits: ['r1', 'm2', 'm1'] },
    { name: 'feature/merged-cleanly', tip: 'm3', commits: ['m3', 'm2', 'm1'] },
    { name: 'feature/rebased-after-merge', tip: 'x2', commits: ['x2', 'x1', 'm1'] },
    { name: 'chore/closed-without-merging', tip: 'c1', commits: ['c1', 'm1'] },
    { name: 'feature/in-review', tip: 'u1', commits: ['u1', 'm1'] },
    { name: 'spike/never-had-a-pr', tip: 's1', commits: ['s1', 'm1'] },
    { name: 'hotfix/cherry-pick-a', tip: 'h1', commits: ['h1', 'm1'] },
    { name: 'hotfix/cherry-pick-b', tip: 'h1', commits: ['h1', 'm1'] },
  ],
  pull_requests: [
    { head: 'feature/merged-cleanly', state: 'closed', merged: true, base: 'main', base_commits: ['m4', 'm3', 'm2', 'm1'] },
    { head: 'feature/rebased-after-merge', state: 'closed', merged: true, base: 'main', base_commits: ['m4', 'm3', 'm2', 'm1'] },
    { head: 'chore/closed-without-merging', state: 'closed', merged: false, base: 'main', base_commits: ['m4', 'm3', 'm2', 'm1'] },
    { head: 'feature/in-review', state: 'open', merged: false, base: 'main', base_commits: ['m4', 'm3', 'm2', 'm1'] },
  ],
};
