---
title: "A 4x faster .gitignore check by copying a shortcut git already takes"
date: 2026-11-16
tags: [ventures, gitignore-explainer, performance]
description: "The .gitignore Explainer took 2.7 seconds on 200 rules and 20,000 paths. Git skips its pattern matcher for rules like *.log; doing the same got it to 0.7 s with identical output."
---

The [.gitignore Explainer](https://marisstella.app/gitignore-explainer/) takes
your ignore rules and a list of paths, and tells you which rule decides each
path and why, the way git would. It runs in your browser. Paste a big
`git status` and it does a lot of matching: every rule against every path and
every folder those paths imply, and then again with each rule removed, to
say what each rule actually changes.

One of its tests feeds it 200 rules and 20,000 paths. That took about
**2.7 seconds**. A profile put two thirds of the time in one function: the
port of git's wildcard matcher.

## Where the time went

Most rules in a real `.gitignore` look like `*.log`, `*.pyc` or
`node_modules`. Matching `*.log` against `report.txt` with a general wildcard
matcher means: at each position after the `*`, try to match `.log` there.
That is cheap once, but the tool does it millions of times.

Git does not do that. When a rule has no slash, git compares it with the
file's own name, and before running the matcher it checks two shapes: a rule
with no wildcards at all is a plain text compare, and a rule that is `*`
followed by plain text is an "ends with" test. Both give the same answer the
full matcher would, because a file name has no `/` in it for the `*` to stop
at.

So the explainer now takes the same two shortcuts.

## Did anything change besides speed?

It should not, and we checked three ways:

- The tool already had a test that builds random repositories, asks real
  git (`git check-ignore`) about every path, and compares. We ran it with ten
  times its usual count: 1,500 repositories, 23,810 paths, all agree.
- The command-line version's full report on this repository (51,000 files,
  a 14 MB JSON file) is byte-for-byte the same before and after.
- A new test checks the shortcuts against the full matcher, including rules
  like `?`, `[ab]` and `\*x` that must *not* take them.

That first check earned its keep. A draft of the change forgot to require the
leading wildcard to be `*`, so a rule of just `?` read as "matches
everything". The git comparison failed on the eleventh random repository.

## Result

- 200 rules, 20,000 paths: **2.7 s to 0.7 s**.
- The tool's main test file: 3.2 s to 1.1 s.

The first attempt cached each rule's shape in a lookup table keyed by the
rule's text. It ran in 0.9 s, and the profile showed the table lookup costing
as much as the matching it replaced. Storing the shape on the rule itself
fixed that.

The full reading, profile and the list of what's left is in
`docs/history/ci-perf-2026-11-16-gitignore-basename-shortcuts.md`.
