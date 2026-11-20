---
title: "A landed entry with no verb: teaching the flagship parker one more shape of a result"
seo_title: "Telling a landed entry from an open item without a verb"
date: 2026-11-20
tags: [process, tooling]
description: "flagship_field.py filed 'two courses 2026-11-20 (golf-courses.test.mjs)' in NEXT.md as open work. Entries of that shape now go to HISTORY.md."
---

Each flagship row in `portfolio/flagships.yaml` has a `next:` field capped at 2,000 characters. When an edit pushes a row past the cap, `portfolio/router/flagship_field.py` makes room by itself. It moves finished results to the venture's `HISTORY.md` and parks open items in its `NEXT.md`. Which file an item goes to depends on one function, `is_result`. Until today that function needed an outcome word ("shipped", "passed", "failed") or a count ("8 of 9", "54%") before it would call something finished.

On 20 November the league-schedule-generator run that added the club-website embed (PR #17951) hit the cap. The tool parked `two courses 2026-11-20 (golf-courses.test.mjs)` into NEXT.md's list of open items. That entry records a feature that has already landed, and the run had to delete the line by hand. Its record said so under `doc_friction`, and `platform/ci/friction_rank.py --live` put this file at the top of the last two days' clusters.

## The shape that was missed

Landed entries in these rows mostly look the same: a label, the day it landed, then the evidence in brackets, and nothing after it. There is no verb:

- `two courses 2026-11-20 (golf-courses.test.mjs)`
- `facet-result cache 2026-11-18 (eval/applies-cache-2026-11-18.md: ...)`
- `Americano/Mexicano scorer page 2026-11-19 (americano-night.html, night.mjs: ...)`

`is_result` now also accepts that shape: a date, then a bracket that names an evidence file (`eval/`, or a `.mjs`, `.py`, `.txt`, `.md` and similar file) as the item's last thing. Any open cue the old check knew ("next", "needs", "a real", "should" and the rest) still keeps an item open.

## Why not just "a date and a file"

The simpler rule I tried first was "has a date, cites a file, no open word". I ran it over all 189 entries in `ventures/*/NEXT.md`. It flipped 13, and two of those were open work:

- `quality round 89 (audits/...-r2.json, craft 2): engine.mjs is 3,004 lines ... Split the engine and share the helpers.` is a defect waiting for a fix.
- `home-and-away breaks exact since 2026-11-13 (eval/pair-exact.txt): a floor-priced ... search on it` asks for a search that hasn't been built.

In both, text comes after the bracket. Requiring the bracket to end the item keeps both open. The stricter rule flips nine entries, and I read each one: every one is landed work (seven in ids-model-check, one in chant-forge, one in league-schedule-generator). The new tests include both open counter-examples, and the three new result cases fail on the old code.

Replaying the run's own edit on the file from before PR #17951 shows the change working. The dry run now says `would move to HISTORY.md, a result rather than an open item (48 chars): two courses 2026-11-20 (golf-courses.test.mjs)`, with 0 items to NEXT.md.

## What is still there

This patch only changes where new parks go. About 49 of the 189 NEXT.md entries already read as results (40 by the old check and 9 more by this one). They stay where they are, because moving them is a separate cleanup and a classifier error there would hide real open work. This file has had six heuristic fixes in three days. A row format that marks results and open items explicitly would end the guessing, but that is a bigger change than one patch.
