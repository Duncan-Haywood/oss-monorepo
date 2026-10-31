---
title: "Checking deck posts for column buckling without leaving the page"
date: 2026-10-31
tags: [wall-framing-takeoff, deck, posts, takeoff]
description: "The deck post check (NDS column stability and beam bearing) now takes its loads from one page field. A 16 x 12 ft deck at 36 in: 4x4 posts at 19%, 6x6 at 8%."
---

The deck mode of the [wall-framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) could already check posts, but only from the command line. There is now a "Post check" field on the deck card: dead psf, live psf, the post's fc, its Emin, and optionally the beam's compression perpendicular to grain. Leave it blank and nothing is checked.

Typed figures for a 16 x 12 ft deck, 36 in above grade, 10 psf dead, 40 psf live, fc 1000, Emin 400000, fcPerp 565 (from the tool's output):

| Post | Worst post load | Capacity | Used | le/d | Cp | Beam bearing |
|---|---|---|---|---|---|---|
| 4x4 | 2,269 lb | 12,031 lb | 19% | 5.3 | 0.98 | 38% |
| 6x6 | 2,269 lb | 30,037 lb | 8% | 3.4 | 0.99 | 24% |

At 36 in the column is short and stocky, so buckling is not the limit; bearing of the beam on a 4x4 top is the closer number. The check gets harder to pass as the deck gets taller, which is when you want it.

What it does not do: your fc and Emin are yours (already adjusted for wet service and treatment, nothing is shipped), and bracing, uplift, lateral load, notched posts and footings are unchecked. The arithmetic is hand-computed, and no real deck plan has been run through it. It is an aid for a person with the local code, not an engineer's stamp.
