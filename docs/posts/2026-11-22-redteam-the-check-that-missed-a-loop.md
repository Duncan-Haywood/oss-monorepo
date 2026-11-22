---
title: "The check that missed a loop: mutation testing the P6 export and the IFC member lengths"
seo_title: "Mutation testing a P6 XER export: a WBS loop the check missed"
date: 2026-11-22
tags: [redteam, testing, mutation-testing, xer-schedule-check, ids-model-check, javascript, ventures]
description: "Red team on two files changed yesterday: 13 of 21 seeded bugs caught, eight gaps closed, and a P6 import check that passed a WBS cycle."
---

Today's red-team run went after two files that changed on `main` the day
before: `p6xer.mjs` in the [XER schedule check](https://marisstella.app/xer-schedule-check/),
which turns a Microsoft Project XML file into a P6 XER, and
`geometry-quantities.mjs` in the [IDS model check](https://marisstella.app/ids-model-check/),
which works out a column's or beam's Length from its geometry.

## Seeded bugs: 13 of 21 caught

| File | Seeded | Caught by the suite | Gaps closed |
|---|---|---|---|
| `p6xer.mjs` (342 tests, 2 s) | 12 | 6 | 5 (one escape is unreachable code) |
| `geometry-quantities.mjs` (469 tests, 16 s) | 10 | 7 | 3 |

The escapes had one thing in common: the fixtures were too tidy.

- Every calendar test checked how many calendars came out, but none checked
  the hours. A typo turning 60 minutes an hour into 61 wrote a 42.4-hour week.
- The "Activity ID" text field was tested on Text1 and Text31. Text12 to
  Text30 sat in a list built by arithmetic that nothing exercised.
- The fixture had no late dates, so a flipped test that blanked the remaining
  late finish on every unfinished activity went unseen.
- Every wall test ran along the x axis, and every member was axis-aligned. A
  wall running north-south, or a sloped diagonal brace, used code paths
  nothing had measured. One mutant made every north-south wall unreadable.

Each now has a test that fails with the bug and passes without it.

## The real bug: a loop the check said was fine

`p6Problems` is the check the converter's tests lean on: it applies P6's
import rules to the tables we write, and most converter tests end with
"no problems". One rule is that every WBS node reaches the project node. It
walked up the parents with a 1,000-step cap, then reported only when it fell
off the tree. A node in a loop (A's parent is B, B's parent is A, or a node
that is its own parent) used up the cap without falling off, so the check
passed it. P6 would not.

The converter doesn't write loops today, so no user file was affected. But
it meant that a converter change that did write one would have passed
every test. The fix reports a walk that ends anywhere but the project node.
A test feeds in a two-node loop and a self-parent. A second test pins a
1,000-level chain as reachable, so the cap stays where it is.

The other parent walks in the venture (`evm.mjs`, `gantt.mjs`) keep a
visited set and stop on a loop, so the bug was only in this one.
