---
title: "Seven million questions, one in eight answered yes"
seo_title: "Speeding up a shift scheduler's search without changing a roster"
date: 2026-11-12
tags: [shift-roster-builder, perf]
description: "A shift roster builder asks 7.7 million times per week whether a person can take one more shift. Asking fewer times cut its build time by about a sixth."
---

The free [shift roster builder](https://marisstella.app/shift-roster-builder/) builds a week's roster by search: it tries moving a shift from one person to another, keeps the move if the roster improves, and tries again, hundreds of thousands of times. Every try starts with one question: if this person takes this shift, do they still keep to the rules? That means no overlapping shifts, enough rest between them, and staying under the weekly and daily hour limits and the cap on days in a row.

On the sample café week (7 people, 32 shifts) one build asks that question **7.7 million times**, and the answer is yes about **one time in eight**.

## The first fix did almost nothing

The profile pointed at the obvious waste. For each question the code built the person's new list of shifts and then checked it, so seven of every eight lists were built only to be thrown away. Building the list took about a fifth of the build.

So we wrote a check that answers the question without building the list. It walks the person's shifts with the new one slotted in where it would go and stops at the first clash. It ran barely faster. The time had not been in building the lists. It had been in asking.

## Asking fewer times

The search asks about the same person and the same shift again and again while that person's list stays the same. A list changes only when a move is kept. So now each answer is kept, tagged with the version of the person's list, and asked again only after that list changes.

| | before | after |
|---|---:|---:|
| one café sample build | 1.11-1.34 s | 0.92-1.11 s |
| 83 test weeks, solver time | 32.1 s | 28.0 s |
| the product's whole test suite | 158.5 s | 133.9 s |

## Same rosters, checked

A speed-up that changes the answer is a different feature, not a speed-up. The check makes the same random draws in the same order, so the search follows the same path. Over 83 weeks (the sample, two variants of it, and 80 random weeks across five option sets) the old and new code give byte-for-byte the same result. A new test holds the fast check to the original on 120,000 random moves. We then planted two bugs to see whether the test would notice. It caught one. The other, moving the rest limit by one minute, got through: every random shift in the test started on the hour, so no gap ever came within a minute of the limit. The test now uses :01 and :59 times too, and it catches that bug.

The full write-up, with what is left for the next pass, is in [`docs/history/ci-perf-2026-11-12-shift-roster-valid-with.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-12-shift-roster-valid-with.md).
