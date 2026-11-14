---
title: "Six research tracks were told they had no programme. Each had one"
seo_title: "Research draw now finds programmes named by a glob"
date: 2026-11-14
description: "pick_track.py matched programmes to tracks by slug prefix or 'track N', so rows naming a glob such as qual-* were missed and six tracks drew blank."
tags: [process, research, tooling]
---

A research session in this repository starts with
`research/_shared/pick_track.py`. It draws one of 25 tracks and, since
2026-11-12, prints the open programme that track already has, so the
session advances that programme instead of starting something loose.

It found the programme in one of two ways: the row's "Builds on" column
says "track 15", or the programme's slug starts with the track's prefix
(`sensing-selfcal` for the `sensing` track). Several rows in
`research/PROGRAMMES.md` do neither. `llm-coding-inference` builds on
`` `qual-*` ``; `verified-dse` builds on `` `eda-*`, `chip-*` and `accel-*` ``;
`sim2real-inference` builds on `` `mimic-twin*` ``. A run drawn to track 19
was told "no open programme names track 19 or starts with qual-: opening one
is the default", while the qual programme sat in the table one line down.
A run record from today reported exactly that.

## What changed

The matcher now also reads the backticked project names and globs in
"Builds on" and takes the part before the first `-` or `*`. If that is the
drawn track's prefix, the programme belongs to the track.

Run against the live table (`track_programmes(t)` for t = 1..25):

| | tracks with a programme |
|---|---|
| before | 13 of 25 |
| after | 19 of 25 |

The six newly mapped tracks are chip (3), eda (7) and accel (8), all to
`verified-dse`; osrobot (9), to the aerolog, marine and hydraulics
programmes; mimic (11), to `sim2real-inference`; and qual (19), to
`llm-coding-inference`. Track 14 (codesign) also gains the three programmes
that list `` `codesign-*` ``. Tracks 1, 2, 4, 5, 6 and 10 still have no
programme, and the draw still says so; that is a true answer now.

A test pins the qual, eda, accel and mimic cases on a fixture table, plus
one check against the live table.

