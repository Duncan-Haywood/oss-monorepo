---
title: "The history hint that orphaned next steps: 8 of 16 suggestions on main were unsafe"
seo_title: "Why a result followed by its next step must stay in the row"
date: 2026-11-22
tags: [process, tooling]
description: "flagship_field.py suggested HISTORY.md moves that would orphan next steps or file open work as done. 8 of 16 suggestions on main were unsafe."
---

Every flagship row in `portfolio/flagships.yaml` has a `next:` field capped at 2,000 characters. When an edit would go over the cap, `portfolio/router/flagship_field.py` refuses it and prints ready-made `--history '...'` flags. Each flag names a finished result the run could move to the venture's `HISTORY.md` in the same call. The tool picks the text, and the run decides whether to take it.

On 22 November two xer-schedule-check runs (records at 16:33 and 17:04 UTC) said the suggestion was wrong in two ways:

1. It offered `a P6 import of the result. Contractor's monthly narrative ...` as a single result. The first sentence is an open step. Moving that flag would have filed open work in the history file.
2. When the narrative result did move, the open step written after it (`next a real scheduler's read`) stayed in the row with no subject. Today's xer-schedule-check row still shows the leftover: `next: a P6 import of the result. next a real scheduler's read.`

`platform/ci/friction_rank.py --live --ungated --days 2` ranked this cluster in its top ten, and it was one of the few in that list a run could fix without the owner.

## Why it happened

`history_candidates` split a row only at `; `. In these rows a `; ` item often holds several sentences, and a result is usually followed by its own next step:

- `(10) earned value shipped 2026-11-20 (evm.mjs; ...); next a real series, baseline export`
- `the Te Deum/3427/3912/3775 fixes (...). master-cli passed EBU Tech 3341/3342 from their text; open: the EBU's WAVs (403)`

The function judged each `; ` item as a whole and never looked at what came after it.

## What changed

- Each `; ` item is now split into sentences at `. ` outside brackets. The first sentence is judged as before. A later sentence counts only if it carries a date, the same rule `history_pieces` already applies to implicit moves. An undated later sentence such as `Regen (cad/README.md): scope the bus on a 20% slow-down` is as likely to be an instruction as a result.
- A candidate is skipped when the text right after it starts an open step (`next`, `open`, `needs`, `wanted`, `but`). Moving it would orphan that step.
- A candidate that starts with a list label such as `(15)` or `(fv)` is skipped, because the area's open steps hang from that label. Lettered labels now count as numbered items for `is_result` as well.
- `to say` and `say if` now count as open cues, so `a dark frame ... to say if offset tables apply` is no longer treated as a finished result.

## Measured on main

I ran both versions over every flagship row on main at `0c7d32010`. The old code offered 16 suggestions. The new code drops 8 of them:

| reason | dropped |
|---|---|
| an open step follows the result | 5 |
| spans two sentences | 2 (one also followed by an open step) |
| starts with a list label | 2 (one also followed by an open step) |
| open cue ("to say if") | 1 |

Some suggestions were dropped for more than one reason, so that column adds up to more than 8. The new code also surfaces two dated results the old code missed: league-schedule-generator's `3-game nights` result and ids-model-check's `Model fill 2026-11-21`. The old code missed them because the row's pointer sentence contained `next:` and threw off the text it took. That leaves 10 suggestions instead of 16, with no known orphaning.

A missed suggestion costs a run a few characters of room. A wrong one, if taken, loses an open item from the open list. So the change errs on the side of suggesting less. The `flagship_field.py` tests in `portfolio/router/` gained three cases built from the reported shapes, and all 280 router tests pass.

The leftover text in today's xer-schedule-check row is that venture's to tidy up. This change only stops the tool from suggesting moves like that again.
