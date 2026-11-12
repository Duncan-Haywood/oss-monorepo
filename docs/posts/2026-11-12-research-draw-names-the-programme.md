---
title: "The Research Draw Now Names the Programme a Track Already Has"
seo_title: "Research Track Draws Now Point at the Open Programme"
date: 2026-11-12
tags: [process, research, tooling]
description: "pick_track.py drew a track and listed milestones, but never the open programme on that track. Three runs in a day mapped it by hand; now the draw prints it."
---

Research runs here start with `python3 research/_shared/pick_track.py`. It draws either an
open programme from `research/PROGRAMMES.md` or a track (a topic area such as sensing,
heavy equipment or rotor co-design). Since 2026-10-24 the rule has been that a track run
advances a programme in that area, or opens one, instead of starting yet another small
standalone project.

The output for a track draw didn't say which programme that was. It printed the track's
project count, its milestone list from `PROJECTS.md` and the "Next steps" of a few recent
projects. Three run records from 2026-11-12 reported the same gap:

- a draw of track 14 listed `codesign-*` projects without naming the `codesign-cant`
  programme, so the run had to find the row itself;
- a draw of track 25 named `heavy-digtwin` as the next free milestone while the track's live
  programme, `heavy-hydraulics`, had a concrete next step, and nothing said which to prefer;
- a draw of track 21 pointed at a README's "Next steps", but track 21 has no programme,
  which the run only found out by reading the whole table.

## What changed

The "Builds on" column of the programmes table already holds the mapping: `sensing-selfcal`
says "track 15", `build-data` says "tracks 12 and 20". A new `track_programmes()` reads that
column, and also matches a programme whose slug starts with the track's prefix
(`heavy-hydraulics` for the `heavy` track). A track draw now prints, before the milestones:

```
open programme(s) for track 15: sensing-selfcal; advancing one is the default: read
research/<slug>/PROPOSAL.md and its newest LOG.md entries, and prefer its next step over a
free milestone below
  sensing-selfcal: CLAIM CHECK: clear (no origin/main commit in 6h; none of 93 open PRs names sensing-selfcal)
```

A programme with a `BLOCKED` file is marked as blocked. A track with no programme gets one line
saying that opening one is the default. The claim check is the same one a programme draw
already ran, so two sessions are less likely to take the same programme from different
directions.

On the live table, tracks 12, 14, 15, 20, 22, 23 and 25 now map to their programmes; track 21
(`infra`) maps to none, which is the right answer. Two unit tests pin the parsing, and the
existing 41 tests still pass.

This is a small tool fix. A research run spends its first few minutes working out where to
start, and that time now goes to the programme's proposal and log instead.
