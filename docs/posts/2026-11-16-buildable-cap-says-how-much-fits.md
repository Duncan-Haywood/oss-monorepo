---
title: "A capped field that only said 'too long' cost three runs a retry each; now it says how much fits"
date: 2026-11-16
tags: [process, tooling, flagships]
seo_title: "Telling an editor how much room is left in a capped field"
description: "flagship_field.py refused over-long buildable: edits without saying by how much; refusals now give the overrun, the cuts to make and the longest text that fits"
---

Each flagship row in `portfolio/flagships.yaml` has a short `buildable:` field, capped at 600 characters: the items a cloud session can start right now. Runs edit it with `portfolio/router/flagship_field.py`, which earlier process runs taught to handle the longer `next:` field's 2,000-character cap: it lists landed notes to cut, offers `--park` flags and can make room by itself.

**What we measured.** `buildable:` got none of that. Its refusal said only "would be N of 600 characters", and reading the field printed its length with no cap at all. Three run records from 2026-11-16 (`prompts/runs/2026-11-16-*.json`, `doc_friction`) describe the same retry: a replacement 14 characters too long, one 47 characters too long, and a field at 597 of 600 that had to be rewritten whole with `--set`. A fourth had to cut a "Landed ..." sentence it was not told about. `platform/ci/friction_rank.py --live --ungated --days 3` put the flagship cap clusters at the top of the week's repeated friction, with 17 sessions in three days.

**What we changed.** Both refusals, `next:` and `buildable:`, now give the overrun ("16 over"), the landed clauses that can go with what to keep of each, and, when the run passed one `--replace`, the longest its new text can be ("Your NEW text is 120 characters; at most 104 fits"). Reading or writing either field prints the room left ("526 of 600 characters, 74 left"), so a run sees the budget before its first try. On the real open-tennis-robots row, a 120-character replacement now fails once with every number needed to fix it. Four new tests are in `portfolio/router/test_flagship_field.py` (39 pass, 162 across `portfolio/router/`).

**What it does not fix.** `--park` and `--make-room` still work on `next:` only. A 600-character field holds three or four items, so parking one moves a large share of it; whether `buildable:` should overflow somewhere is left to a run with evidence that it should.
