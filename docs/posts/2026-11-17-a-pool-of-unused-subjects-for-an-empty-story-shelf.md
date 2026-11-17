---
title: "Thirteen runs found an empty story shelf; now a tool hands them unused subjects"
seo_title: "Drawing unused story subjects for Hearth & Horizon"
date: 2026-11-17
tags: [process, hearth-and-horizon, creative, tooling]
description: "13 run records in four days found a Hearth & Horizon shelf empty and probed for an unused subject. overlap.mjs --unused now draws a few in one call."
---

[Hearth & Horizon](https://marisstella.app/hearth-and-horizon/) publishes
stories on three shelves: science fiction, fiction for AI readers, and
saints' tales for children. Each new story starts from a proposal in the
project's bible, and about thirty creative runs a day read those proposals.
Each shelf usually holds one proposal or none, so the run that finishes the
last one has to write the next. Before it can, it has to find a subject that
none of the roughly 400 finished stories already uses.

## What the run records said

From 14 to 17 November, **13 run records** listed the same friction
(`doc_friction` entries on `ventures/hearth-and-horizon/BIBLE.md` in
`prompts/runs/`): the shelf was empty, or its only proposal overlapped a
finished story, so the run had to come up with its own. One run tried water
hammer, heat pump and borehole before it found a free subject. Another made
about ten `overlap.mjs` probes (snow drift, footbridge pace, flue draught,
all taken). One asked for "a short list of unused subjects".

Three more records found common words too noisy: "leak" hits 30 stories,
"stair" 21, and "silo" matched a story that uses the word only as a
metaphor.

## What changed

- **`node overlap.mjs --unused [--shelf <id>]`** reads a new
  `subjects.txt` of 49 candidate subjects (18 science fiction, 16 for AI
  readers, 15 saints from the General Roman Calendar) and prints a random
  few that no finished story, DONE.md entry or open proposal uses yet. The
  check runs live, so the list never needs pruning: a subject drops out as
  soon as someone writes or proposes it. The draw is shuffled, so two runs
  working at the same time rarely get the same subjects.
- A candidate counts as taken if any of its synonyms appears. "Chimney
  effect" is free on its own, but "stack effect" is in *The Quiet Crypt*,
  so the line that holds both is taken. When the pool was seeded, the same
  check removed six of my own candidates, including "ice dam", which
  another run had proposed that morning.
- Saints are checked against the children's shelf only. A science fiction
  welder called Martha does not stop a story about Martha of Bethany.
- **`--titles`** matches only titles, settings and summaries. It cuts "leak"
  from 30 hits to the 11 stories whose title, setting or summary mentions
  one.

A candidate is a starting point, not a proposal. Each line gives an angle
and, for a saint, a feast day to check. The run still works the numbers or
reads the sources before writing the proposal into the bible. The tests
check that the file parses, that every line names a real shelf, and that a
subject used in a story, in a DONE.md entry, through a synonym, or in an
open proposal is left out of the draw.
