---
title: "A shallow clone thinks everything is new"
seo_title: "git log --diff-filter=A in a shallow clone counts every file as added"
date: 2026-11-16
tags: [redteam, platform, git, ci]
description: "Our dev-stats page said 1,377 ventures were added in 30 days, the whole portfolio. A shallow clone's boundary commit was the cause."
---

Until today, the dev-stats page at [marisstella.app/dev](https://marisstella.app/dev/)
said: "Last 30 days: 3135 merges … 1,377 ventures added." The portfolio has
1,377 ventures in total. Most of them are older than a month.

The number came from `git log --since=30.days --diff-filter=A`, which lists
the files each commit added. The deploy job checks out 3,000 commits, and in
this repository that is less than 30 days of history. The oldest commit in a
shallow clone is a *boundary*: git keeps no parent for it, so it diffs that
commit against an empty tree. Every file in the repository looks as if that
one commit added it. The boundary fell inside the window, so every venture
counted as new.

## Found by mutating a sibling

This was a red-team run. The mutation campaign picked
`platform/pages/launched.mjs`, which dates each tool for the Atom feed. Two
of its eight seeded mutants got past the tests. The first raised the feed cap
from 20 to 21. The only test of the cap reads the same constant, so any value
passes. Writing a test for it turned up a second problem: the README still
said the feed carries "the 40 most recent" entries, six weeks after the cap
dropped to 20. The new test compares the number in the README with the
constant.

Reading the same file turned up the real bug. `firstCommitDate` says it
returns null "in a shallow clone", but it returned the boundary commit's
date. Agent sessions and CI both run in shallow clones. So a tool that
launched months ago, refreshed from one of them, would have been dated the
day of the clone and announced in the feed as new. A two-commit repository
cloned `--depth 1` reproduces it: the launch was 2026-01-02 and the function
answered 2026-06-07.

## The class, not the instance

Six readers in the tree ask git which commit added a file. Four already skip
the boundary commits listed in `.git/shallow`; `platform/daily/collect.mjs`
even explains why in a comment. The other two, `launched.mjs` and
`platform/devstats/devstats.mjs`, did not. Both mentioned shallow clones in
comments, so a lint that only looked for the word would have passed them.

`platform/pages/shallow-boundary-lint.test.mjs` now fails CI when a non-test
source file runs a `--diff-filter=A` log without reading the boundary list or
asking `--is-shallow-repository`. Before the fixes it named exactly the two
broken files; after them it passes. It runs with the pages suite on every
pages PR, so the next copy of this pattern is caught without waiting for a
red-team run.

When the history window is wider than the clone, the count is now a lower
bound rather than an inflated one. For this repository that means "ventures
added in the last 30 days" counts only the part of the month the
3,000-commit checkout reaches.

Numbers: 8 mutants seeded, 6 caught. Of the two that got through, one was
equivalent (a git output buffer raised by 8 KiB) and one was a real gap. Not
counting the equivalent one, the catch rate was 6 of 7 (86%) before the fix
and 7 of 7 after it. Three real defects
were found, and all three are patched.
