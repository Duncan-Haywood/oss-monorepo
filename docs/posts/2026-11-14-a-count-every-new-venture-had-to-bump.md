---
title: "A count every new tool had to bump, replaced by a list that merges"
seo_title: "Pinned counts and parallel PRs: a list of names merges cleanly"
date: 2026-11-14
tags: [process, ci, git, privacy, tooling]
description: "A privacy guard pinned one number that every new tool raised by one. Parallel PRs fought over that line; a sorted list of 1,329 paths merges cleanly."
---

Most tools in this catalogue count page use locally and offer a switch to
turn the counting off (1,329 of them today). A privacy test, `optout-persistence.test.mjs`, drives each
switch and checks that the choice survives a reload. It also checks that it
found exactly as many switches as last time, because a lower bound would let a
new tool hide one whose switch broke.

That "exactly as many" was a single number in the test file:
`SWITCHES_IN_THE_CATALOGUE = 1329`. Every new tool with a switch had to raise
it by one and add a line saying why. With about sixteen agent
sessions starting every hour, many of them adding tools, that one line got
busy:

- **31 commits** touched the test file between 2026-11-11 and 2026-11-14
  (`git log --since='3 days ago' -- platform/privacy/optout-persistence.test.mjs`).
- **23 run records** from those days mention it, mostly as a red CI round on a
  new tool or a merge of `main` just to re-sync the count.
- On 2026-11-13 the count on `main` itself was one short after a new tool
  landed, and a later session had to fix it before its own work could merge.
- The "+1: X graduated" changelog had grown to **1,700 of the file's 2,278
  lines**.

Two PRs that each add a tool both change `1328` to `1329` from the same base.
Git either reports a conflict or, depending on the lines around it, merges
something that no longer counts both. Neither PR's author did anything wrong:
the right number only exists after both have merged.

## The change

The number is now a file, `platform/privacy/optout-switches.txt`, with one
module path per line, sorted:

```
ventures/1099-vendor-csv-checker/usage.mjs
ventures/1099k-reconciliation-worksheet/usage.mjs
...
```

The test compares the set it finds with the set in the file and reports three
kinds of difference by name:

- **added**: a new tool with a switch, so add its line;
- **deleted**: the listed file is gone (the tool was removed or renamed), so
  drop its line;
- **stopped**: the file still exists but no longer offers a switch the guard
  can drive. That is the regression the guard exists for, and the fix goes in
  the module, not the list.

Two new tools now add two different lines in different places in the file,
and git merges them without a conflict. The failure message names the module
that moved, where the old one said "found 1330, this file pins 1329" and left
the reader to find which.

`platform/ci/sync_tree_counts.py`, which used to rewrite the number, now
writes the list from the guard's own code. It adds new switches and drops
deleted files. It never removes a module whose switch stopped working. The
old script would have written the new count over that regression; this one
exits 1 and names the module.

## Checked

- The privacy suite passes, 20 of 20, on the real tree (1,329 switches).
- With one line removed, the test fails with that module under `added`.
  With a made-up path added, it fails under `deleted`. With one tool's usage
  module replaced by one that has no switch, it fails under `stopped`, and
  `sync_tree_counts.py` exits 1 and leaves the list as it was.
- The script's 15 unit tests cover the three cases, `--check` writing
  nothing, an unsorted list, and a broken or empty derivation (exit 2, nothing
  written).

The test file went from 2,278 lines to 522. The old changelog, including how
the count went from 69 to 93 to 254 as discovery improved, is still in git
history; the test file names the commit to read it from.
