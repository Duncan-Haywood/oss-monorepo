---
title: "A branch called __proto__: what a pull request's name could do to our stats page"
seo_title: "Prototype pollution from GitHub branch names in Node.js tallies"
date: 2026-11-12
tags: [security, testing, mutation-testing, nodejs, github-actions]
description: "Our stats page counted CI runs per branch in a plain object. A branch named __proto__ polluted Object.prototype; a workflow named constructor crashed it."
---

The [developer stats page](https://marisstella.app/dev/) is rebuilt every few
hours by `platform/devstats/`. It reads the GitHub API and counts things:
merged pull requests, CI runs, how many commits a branch took before its checks
went green, which workflows fail on `main`. Today's red-team run seeded eight
faults into `devstats.mjs`. The tests caught five. Reading the code after
that turned up a real bug.

## The bug

To count CI tries per branch, the code did this:

```js
const byBranch = {};
for (const r of prRuns) {
  const b = (byBranch[r.head_branch] ??= {});
  b[r.head_sha] ??= { at: r.created_at, failed: false };
}
```

`r.head_branch` comes from whoever opened the pull request, and in a public
repository anyone can open one from a fork. `__proto__` is a valid git branch
name. On a plain object, `byBranch['__proto__']` isn't missing, it's
`Object.prototype`, so `??=` keeps it, and the next line writes a property onto
the prototype of every object in the process. A branch named `constructor`
gets `Object` itself. Either way the branch disappeared from the totals: in
our reproduction, three branches showed up as one.

Workflow names were worse. A fork can add a workflow file with
`name: constructor`, and its runs show up in the same API list. The per-workflow
tally then pushed onto `Object.minutes`, which is `undefined`, so it threw.
The build catches that error and prints "unavailable", which meant one pull
request could blank the CI section of the page.

What it could not do: run code or read the build's token. The keys it could
write were a commit SHA and four counter names. Still, a public page shouldn't
be something a stranger can switch off by naming a branch.

## The fix

Each tally keyed by outside text now starts as `Object.create(null)`, an
object with no prototype, so `__proto__` and `constructor` are just strings.
That covers nine of them: branches, per-branch commits, events, workflows, red
spells, failing workflows, review verdicts, run-record groups and doc-friction
counts. A new test feeds those names through both code paths, checks they are
counted like any other name, and checks that `Object.prototype` is left
untouched. It fails on the old code.

## The three faults the tests missed

- `quantile` interpolated from the wrong index (`pos + lo` instead of
  `pos - lo`). The tests only used cases where `lo` was 0, so the two gave the
  same answer. A new case, the 75th percentile of `[0, 10, 20]`, has to be 15.
- The page budget for pull-request runs (3 pages of 100) wasn't pinned,
  because no fake API ever returned a full page. A new fake does, and the test
  checks each list stops at its budget.
- The "top eight failing workflows" cut became top nine and nothing
  noticed. The same test sends nine failing workflows and expects eight back.

Before the fix the tests caught 5 of 8 seeded faults. After it they catch all 8.

If you write a Node script that counts anything by a name someone else chose,
like a branch, a tag, a username or a form field, start the tally with
`Object.create(null)` or use a `Map`.
