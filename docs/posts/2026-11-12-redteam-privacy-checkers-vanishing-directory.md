---
title: "One fix, three walkers: the crash our privacy checks fixed once and kept twice"
seo_title: "readdir then stat race in Node.js test suites: ENOENT from a parallel test"
date: 2026-11-12
tags: [privacy, testing, mutation-testing, nodejs]
description: "A Node test that makes and removes a temp directory can crash any other test file walking the same tree. We fixed that in one checker in October and left it in two others."
---

Every product in this catalogue says in its footer that the local usage counter
turns off when the browser sends Do Not Track or Global Privacy Control. The
checks under `platform/privacy/` make sure that's true: one calls each product's
usage module with each signal set, one makes sure each page has exactly one
opt-out key, and one checks that every call to `recordUsage` passes its
arguments in the order that product declares. Today's red-team run seeded 24
faults across three of those files. The tests caught 21.

## The three that got through

- **`browser-signals.mjs`**: the directory walk skips `node_modules` and
  hidden folders with `a || b`. Changing it to `a && b` stops it skipping
  either, and no test noticed. Inside the repository, git's ignore rules hide
  the mistake. In a temp folder they don't apply, and the walk would count a
  dependency's copy of a usage module as one of ours.
- **`one-opt-out.mjs`, `checkPageOrder`**: this is what flags a page that
  counts a visit before it has read the visitor's opt-out. Flipping its
  `!== "pass"` made every such page read as passing. The tests checked the
  helper underneath on a plain string, and ran the full function only over the
  real catalogue, which is clean. So the inverted version passed too.
- **`one-opt-out.mjs`, `describe`**: one `+` turned into `-` in the error
  message, so it began with "NaNstored by one half...". The test only matched
  the end of the sentence, so it still passed.

Each now has a test that fails with the fault in place. All three are caught
on rerun (21 of 24 before, 24 of 24 after).

## The real bug: a directory that disappears mid-walk

`node --test` runs test files in parallel. One of them,
`browser-signals.test.mjs`, creates a scratch product folder under
`ventures/` to check discovery, then deletes it. Any other file walking
`ventures/` at that moment can list the folder with `readdir`, call `stat` on
it after it's gone, and crash with `ENOENT`. That happened in CI on
2026-10-21, inside `one-opt-out.test.mjs`. The fix went into
`browser-signals.mjs`: catch `ENOENT` on the `stat` and skip the entry.

The fix never reached the walker in `one-opt-out.mjs`, the suite that
actually crashed. It also never reached the walker in `usage-call-order.mjs`.
A dangling symlink reproduces the race every time, and both walkers threw:

```
call-order THROWS ENOENT
findPages THROWS ENOENT
browser-signals 1
```

Both walkers now skip a vanished entry the same way, and each has a
dangling-symlink test. So all three walkers of `ventures/` in this folder are
covered, not just the one that got fixed first.

## What to take from it

A fix for a race belongs wherever the code races, not only in the file that
showed up in the stack trace. A fault seeded into the code is also a fair test
of the test that guards it. "Passes over the real data" proves little when the
real data is clean.
