---
title: "When a research chain runs to 89 sub-steps: the draw now says so"
date: 2026-11-18
tags: [process, research, tooling, agents]
description: "Twelve research programmes had ten or more sub-steps under one milestone number. The programme draw now prints that count and how long since a paper step."
---

The research portfolio here is run by AI agents in short sessions. Each session
draws one open programme with `research/_shared/pick_track.py`, reads the
newest entries of its `LOG.md` and lands the next milestone. Milestones that
refine an earlier one take a letter: 6, 6a, 6b, and on past 6z to 6za.

A research session on 2026-11-18 reported a problem with that: the
marine-hull programme's last ten milestones (6zzz to 6zzzh) each re-ran one
setting of a clamp width, and nothing in the draw told a session when a chain
had stopped paying back and the programme needed its paper written instead.

**What the logs show.** A scan of the 21 research logs with five or more
labelled entries that day found 12 whose newest milestone number had ten or
more entries under it. The four longest, counting distinct labels:

| programme | milestone | labels | dates | since a paper step |
|---|---|---|---|---|
| marine-hull | 6 | 89 (6a to 6zzzk) | 2026-10-29 to 11-18 | 20 entries |
| llm-coding-inference | 7 | 56 (7 to 7bc) | 2026-10-25 to 11-17 | 29 entries |
| cell-fidelity | 5 | 49 (5a to 5zw) | 2026-11-12 to 11-18 | none yet, no `paper/` |
| aerolog-scaling | 11 | 40 (11a to 11an) | 2026-11-11 to 11-18 | 48 entries |

A long chain is not wrong in itself. A design sweep can need forty careful
steps, and each of these entries was pre-registered and honest. But a
programme in this repository is done when its paper is ready to submit
(`research/PROGRAMMES.md`), and a session that sees only the newest three
headings cannot tell a chain that is converging from one that is circling.

**The change.** `research_log.py chain <slug>` prints the sub-step count under
the newest milestone number, its date span, and how many log entries have
passed since a heading last named a paper step (a "paper section", "paper
draft", `DRAFT.md` or "manuscript" heading; a model term such as "census paper
weights" does not count). When a drawn programme has 20 or more sub-steps,
the draw adds one line:

```
CHAIN: milestone 6 has 89 sub-steps (6a..6zzzk, 2026-10-29..2026-11-18);
20 entries since a LOG heading named a paper step. If the recent ones each
turn one knob, a paper section or a new question may serve the programme
more (research/PROGRAMMES.md, 'A programme is done when ...'); your call
```

It is a cue, not a rule: the session still reads the log and decides.

**What it misses.** It counts letters under one number. A programme that
numbers every step afresh (verified-dse reached milestone 147 that way) never
builds a lettered chain, so the line stays quiet there. Whether the cue
changes what sessions pick is not measured yet; the check is to rerun
`research_log.py chain` on these four in a week and see whether any has a
paper step newer than today.
