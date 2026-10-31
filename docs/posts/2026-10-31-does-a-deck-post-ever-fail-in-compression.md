---
title: "Does a deck post ever fail in compression? Numbers from the takeoff"
date: 2026-10-31
tags: [wall-framing-takeoff, deck, posts, structural-check]
description: "A 16 x 12 ft deck at 50 psf puts about 2,300 lb on its busiest post. A 4x4 at 90 in is still at 27% of its column capacity. Where the limit really is."
---

The wall-framing takeoff's `--deck` mode now has an optional `postCheck`: you type the dead and live load (psf) and the post's design values `fc` and `Emin` (psi), and it reports the busiest post's load against its column capacity. It uses the NDS column-stability factor, pin-ended, and also checks the beam's bearing on the post top if you type `fcPerp`.

**What the numbers say** for the 16 x 12 ft sample deck (two-ply 2x10 beam, 12 in cantilever, three posts 84 in apart, 10 dead + 40 live psf). The design values below are illustrative typed figures (`fc` 975 psi, `Emin` 510,000 psi), not a grading-rule lookup:

| Post | Height above grade | Post length | le/d | Busiest post | Capacity | Used |
|---|---|---|---|---|---|---|
| 4x4 | 36 in | 18.5 in | 5.3 | 2,269 lb | 11,782 lb | 19% |
| 4x4 | 60 in | 42.5 in | 12.1 | 2,269 lb | 10,941 lb | 21% |
| 4x4 | 90 in | 72.5 in | 20.7 | 2,269 lb | 8,261 lb | 27% |
| 6x6 | 90 in | 72.5 in | 13.2 | 2,269 lb | 26,478 lb | 9% |

So on an ordinary residential deck, a post in pure compression is rarely the weak link. What rules the post out in practice is everything the check does not cover: lateral bracing and sway, the connection at the beam, uplift, notched posts and the footing's bearing. The tool says so in its output and does not size any of them.

Limits of this work: the arithmetic is hand-computed in `deck.test.mjs`; no real deck plan or permit set has been run through it. It is an estimate for planning, not engineering advice; your engineer and your local code decide the post.

Source: [`ventures/wall-framing-takeoff`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/wall-framing-takeoff).
