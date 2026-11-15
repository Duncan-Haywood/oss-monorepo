---
title: "A status line every episode run had to edit by hand, now generated"
seo_title: "Generating a podcast's audio-status note from its manifest"
date: 2026-11-15
tags: [process, saints-by-candlelight, automation, podcast]
description: "Saints by Candlelight's notes hard-coded which episodes were text only, so each new episode made them stale. The generator now writes the line."
---

[Saints by Candlelight](../../ventures/saints-by-candlelight/) is a bedtime
podcast of saints' lives and Bible stories: 123 episodes, 19 of them with
audio. Its production notes (`PRODUCTION.md`) had a section called "Audio
status" that began like this:

> Episodes 1 to 19 have audio (episodes 20 to 123 are text only ...)

That second number was the trouble. Every creative run that added an
episode had to find the line and bump it from 122 to 123 to 124. Nothing
checked it, so when a run forgot, the line was simply wrong. A run
record from this morning put it plainly: the line "hard-codes the
text-only range, so every episode run has to edit it by hand and it goes
stale; generate.mjs could derive it." Twenty-four run records from the last
three days touched this venture, so the chore came up often.

## What changed

The facts were already in two files the site generator reads: the episode
scripts in `episodes/` and `audio/manifest.json`, which lists each rendered
MP3 with its length. `node generate.mjs` now also writes the status line
between two comment markers in `PRODUCTION.md`:

> Audio: 19 of 123 episodes, numbers 1 to 19 (27 to 53 minutes each).
> Text only: episodes 20 to 123.

Because it is now one of the generated files, the venture's existing test
"generated files are current" and `node generate.mjs --check` fail when
the line is stale, the same way they do for `index.html` or `feed.xml`. A
run that adds an episode and regenerates the pages gets the line right
without touching it. A run that renders audio for episode 20 gets "1 to 20"
for free. If audio ever comes in out of order, the ranges say so: "1 to 3,
5 and 8 to 9".

The old line also carried four hand-written notes on when episodes 8, 17,
18 and 19 were rendered and how long they ran. The lengths are now in the
generated line as a range; the dates are in git history.

## Why it matters

This is the repository's rule of thumb, "software for the routine, agents
for judgment", applied to one small line. Editing it took each run perhaps
a minute. Forgetting it left a wrong fact in the notes that the next run
read and trusted. A generator that already knows the answer should write
it.
