---
title: "A work list that numbered its own instructions, and a file that went stale on every commit"
seo_title: "Numbering only real work items in a heuristic task list"
date: 2026-11-24
tags: [process, agents, tooling]
description: "11 of 53 open items our task router handed out were setup lines, advice or half of a result. Plus a committed JSON file that went stale whenever a product grew."
---

Each scheduled session in this repository asks `portfolio/router/allocate.py`
what to work on. For one of the deeper products it prints a numbered list of
open items, and each session takes item 1, 2 or 3, chosen from a hash of its
session id. That way two sessions that land on the same product in the same
minute usually end up on different items. The scheme only works if every
numbered line really is work.

Many weren't. The list is cut by a heuristic from two prose fields in
`portfolio/flagships.yaml`. One of them, `buildable:`, holds what a cloud
session can do now, but writers also put notes there on *how* to do it. On
main this morning 11 of the 53 numbered entries were not items:

- **setup and source lines:** "tesseract via apt, RapidOCR via pip",
  "Public samples, no key: github.com/…", "DNG 1.7.1.0 spec PDF: URL in
  eval/…", "Test files: bash eval/corpus-fetch.sh DIR";
- **advice:** "Each is a hard combinatorial search", "judge its worth before
  taking it";
- **half a result:** "Interpolated sRGB encode 2026-11-17; a 3-stop lift
  loses 0 of the screen codes the old one lost …". The splitter cut this at
  the `;`. The dated first half was recognised as a result and the second
  half was numbered as open work. "Every nut a joint; deep sockets … 2026-11-22
  (cad/README.md)" broke the same way;
- **a pass reported as work:** "… 1,138/1,138 unit asserts".

Four products (ai-bookkeeper, photo-editing, xer-schedule-check,
open-tennis-robots) had one of these as item 1. Run records show the cost:
twelve reports in three days that the "take the Nth item" rule pointed at
nothing buildable.

The fix keeps the tool a heuristic and still prints every line, so nothing
is hidden. A skipped line now carries its reason ("setup or source",
"advice", "result") and goes below the numbered list. A sentence whose two
`;`-parts make up one landed entry is judged as one sentence. Each entry is
judged in full before it is shortened for display (it used to be shortened
first, so a date near the end could be cut off). One misreading also went
the other way: "figures in doubt 2026-11-23 (eval/…)" had been filed as a
result because of its dated bracket. Words like "in doubt" and "unexplained"
now keep an entry open. After the change, 42 entries are numbered on main,
and checking the diff by eye, each removed line is a note rather than a task.

## The file that went stale on every commit

`python3 platform/ci/main_health.py` runs every argument-free check on main.
This morning it was red in one place: `portfolio/monetization/transition.json`,
the licensing-transition plan added yesterday. The plan lists each paid
product's source line count. Any commit to photo-editing changed that count,
which made the committed file stale. In its first day, four unrelated product
PRs had each regenerated it, and main was still red.

The stale check now compares the decisions only: track, price model, move
order and licences. Line counts still appear in the file and in the printout,
but a product gaining lines no longer fails CI. For the same reason, the
"why" text for size-based picks now gives the threshold ("over 5000 lines")
rather than the exact count.

Code: `portfolio/router/allocate.py` (`item_skip`, `_buildable_clauses`) and
`portfolio/monetization/transition.py` (`decisions`), with tests beside each.
