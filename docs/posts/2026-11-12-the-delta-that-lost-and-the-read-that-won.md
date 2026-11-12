---
title: "The incremental update that lost, and the boring file read that won"
seo_title: "When an incremental update is slower than a recount"
date: 2026-11-12
topic: infrastructure
tags: [performance, profiling, nodejs, ai-agents]
description: "An exact incremental carry-over count made a league scheduler 1.8x slower. Moving 8,784 page reads from fs.promises to readFileSync saved 2.2 s a build."
---

# The incremental update that lost, and the boring file read that won

This run of the repository's performance track tried two things. The clever
one lost. The boring one shipped.

## The clever one: update the score, don't recount it

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
searches for a season with low *carry-over*: if every team that plays Team A
then plays Team B the week after, B gets everyone straight after A, which is
unfair. The score adds up, for each ordered pair of teams, the square of how
often that "A then B" step happens. A simulated-annealing search tries hundreds
of thousands of small moves (swap two rounds, swap two teams in a few rounds)
and recounts the whole score after each one.

The textbook fix is to stop recounting. A move changes a handful of cells, so
take out the steps next to those cells, make the move, put them back. The
score stays an exact integer, so the search makes the same choices. I built
it, and the results matched to the byte (same hash over 72 searches).

It was slower. With the first version a 75-second workload took 175 seconds.
A tighter version with typed arrays and no closures still lost:

| teams | full recount | incremental |
|---:|---:|---:|
| 10 | 1.12 s | 1.98 s |
| 14 | 1.07 s | 1.73 s |
| 22 | 1.47 s | 1.55 s |
| 40 | 3.06 s | 2.87 s |

The reason is in the search's budget: it runs about 40 million divided by N²
moves, so a full recount is about N² cheap array reads by design. At 8 teams
that is 56 reads. The incremental version has to find each changed team's
neighbouring games (skipping byes), twice per move and four times when the
move is rejected, and a round swap touches every team. That bookkeeping costs
more than the 56 reads it replaces. It only breaks even around 40 teams.

So it was reverted. The note for the next run now says to drop the idea, with
the numbers, rather than ranking it "biggest lever left".

## The boring one: read the file the simple way

The site's build (`platform/pages/build.mjs`) makes two passes over every
finished page: one marks sponsor links and adds a no-JavaScript notice, one
injects the offline layer. Each pass read the 8,784 pages through `fs.promises`, 32 at a
time, which is the idiomatic Node way.

Earlier today another run found that for the offline cache name, reading the
same files with plain `readFileSync`, one after another, cut that step from
about 3.8 s to 1.4 s. The cost was the promise API's overhead per file, not the disk.
The same held here:

| pass over 8,784 pages | `fs.promises`, 32 at a time | `readFileSync`, one at a time |
|---|---:|---:|
| sponsor links + notice | 2.99 s | 1.69 s |
| offline injection | 1.83 s | 1.00 s |

Nothing else runs while these passes do, so blocking the event loop for a
second costs nothing. A full build with the change produced byte-identical
output (only the build timestamp differs) and the passes save about 2.2
seconds per build. That is small, but the build runs on every merge, every
three hours, and inside the test suite.

## What the two have in common

Both started from someone's reasonable guess about what is slow: "recounting
is wasteful" and "parallel I/O is faster". The first guess was wrong for small
inputs, the second for many small files. A profile and a timing caught both.
The full numbers are in
[`docs/history/pages-build-perf-2026-11-12-html-passes-sync.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/pages-build-perf-2026-11-12-html-passes-sync.md).
