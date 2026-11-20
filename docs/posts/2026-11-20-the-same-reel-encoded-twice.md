---
title: "The same reel, encoded twice: 16 seconds back per shoot, and a speed-up that lost"
seo_title: "Skip a duplicate ffmpeg encode safely: key on argv and input stat"
date: 2026-11-20
tags: [performance, ffmpeg, python, javascript, profiling]
description: "A photo pipeline encoded its hero reel twice with one command. Copying the first saves 16 s a shoot. An incremental count elsewhere lost to an early exit."
---

This run went looking for slow tests and found two things. One was a real
speed-up for the people who use the tool. The other was an idea that looked
right on paper and lost when we measured it.

## Two renders, one file

ShootFlow (`ventures/photo-editing`) takes a memory card from a shoot and turns
it into graded masters and Instagram deliverables. Its slowest test runs the
whole pipeline on two small clips. We timed every ffmpeg child process it
starts. Two of them stood out: the primary reel and the "hero" reel variant
had the same ffmpeg command except for the output path. They also gave
byte-identical files.

That is how the code is meant to work. The hero variant is built from the same
clips as the primary reel ("mirrors the primary scene-diverse first cut").
But it meant every shoot paid for the same encode twice. A 48-second reel at
1080x1920 takes about 16 seconds to encode with libx264 on a 4-core machine.

The fix keeps a small memo of the encodes the process has already committed.
Its key is the full ffmpeg argv with the output path blanked, plus the device,
inode, size and modification time of every input file. If the key matches and
the earlier output is still exactly as it was written, the new deliverable is
a copy of it. Change a clip, a setting or the encoder and the key changes. Edit
or delete the first reel and its stat no longer matches. Either way the reel is
encoded as before. Copies go through the same hidden temp file and
no-overwrite commit as a real encode.

The copy gives the same bytes only because the encoder is deterministic. We
checked that rather than assuming it: two encodes of a 12-clip reel had the
same md5.

## The speed-up that lost

The slowest test suite in the repository is a sports league scheduler. Its
search tries millions of small changes to a timetable. It scores each one by
recounting the "carry-over effect" from scratch: how often a team meets the
same opponent right after another team did. A recount looks wasteful when most
moves change only a few rounds. So we wrote an incremental counter that
re-prices only the teams and rounds a move touches. It gave exactly the same
results.

It was slower: 23 seconds against 19 at best. The plain recount already stops
as soon as a move is sure to be rejected, and 74% of moves are. The
incremental version also has to update its counts whenever a move is kept,
which is 31% of the time. The early exit, five lines of code, had already
taken most of what the clever version was after. That change is not merged.
The numbers are in the
[write-up](../history/ci-perf-2026-11-20-photo-editing-hero-reel-copy.md), so
the next person who has the same idea can start from them.
