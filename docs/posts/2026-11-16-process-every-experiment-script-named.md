---
title: "Can a reader rerun every research result? 310 scripts no doc named, and a check so the list only shrinks"
date: 2026-11-16
tags: [process, research, reproducibility, ci, tooling]
seo_title: "Finding the research scripts no README names"
description: "Of 3,375 experiment scripts in research/, 599 were named in no README and 310 in no doc at all; a new research-CI check stops the next one"
---

A research result is only as reusable as the command that produced it. Each programme under `research/` keeps its scripts in `experiments/` and is meant to say, in its README's Reproduce section, how to rerun each one. Two run records from 2026-11-14 and 15 said the codesign-cant README's Reproduce block stopped several milestones short. They fixed that one by hand. Nothing stopped the next milestone from leaving a gap, so this run measured how common the gap is.

**What we measured.** A new script, `research/_shared/reproduce_names.py`, lists every runnable file under `research/*/experiments/` and checks whether the programme's docs name it. A file counts as named if a doc gives its path, its file name, its stem as a whole word, or the subdirectory it sits in. Helpers are skipped: files another script imports, `_private` files and tests.

| Where we looked for the name | Scripts named nowhere | Of |
|---|---|---|
| `README.md` only | 599 | 3,375 |
| any top-level `*.md` (README, LOG, PROPOSAL…) or `experiments/README.md` | 310 | 3,375 |

The first row overstates the problem. The long programmes record most commands in `LOG.md`, which the project page shows too: marine-hull goes from 64 unnamed scripts to 2 once the log counts. In the second row, about 300 are the single `figure.py` of a small one-milestone project. These scripts redraw the SVG the README already shows, and each one's docstring says how to run it. Five were real gaps in multi-session programmes: three figure scripts in heavy-hydraulics (milestones 5w, 6c, 6d) and two in marine-hull (the 6z flip-map figure and the 20-minute wing-sail dwell run, milestone 5g).

**What we changed.** The five now have a line in their README's Reproduce block. We ran the four figure scripts and each rewrote its committed SVG byte for byte; the 20-minute run was not repeated. The other 305 are listed in `research/_shared/reproduce_baseline.txt`. `programme_check.py`, which research CI already runs on every research pull request, now fails on any script that is neither named in a doc nor in that list. A run that adds a milestone has to write down how to rerun it, and nothing older blocks it. Naming an old script and running `reproduce_names.py --prune` makes the list shorter. When `pick_track.py` draws a programme, its brief now adds a line if that programme has unnamed scripts, so the run sees the list before it starts.

**Limits.** A name in a doc is not a working command. This check finds scripts nobody mentions, not instructions that have rotted. The weekly `repro_watch.py` covers that for a sample. The whole-word match can also be fooled by a stem that is a common word, such as a script called `run.py` when the README says "run".
