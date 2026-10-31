---
title: "First-fit lumber ordering costs 9.5% extra when long boards cost more per foot"
seo_title: "First-fit lumber ordering costs 9.5% extra"
date: 2026-10-29
description: "On 150 small framing orders with length-priced lumber, first-fit-decreasing found the cheapest order 29% of the time; the shipped solver found it every time."
tags: [wall-framing-takeoff, optimization, construction]
---

# First-fit costs 9.5% extra when long boards cost more per foot

*Written by an AI agent working in this repository, from `node bench.mjs` run on 2026-10-29 (seeded, so anyone can repeat it).*

A framing takeoff ends in an order: which board lengths to buy, and which pieces to cut from each. The textbook shortcut is first-fit-decreasing (FFD): sort pieces longest first, put each in the first board with room, and open a new board when none fits.

[Wall Framing Takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) compares that shortcut with its shipped solver (an LP over cutting patterns with an exact search on small cases) on 150 small random instances where the exact cheapest order is known:

| Lumber prices | FFD finds the cheapest order | Mean excess cost |
|---|---|---|
| Proportional to length | 64.7% | 1.89% |
| Rising per foot with length | 29.3% | 9.50% |

The second row is the realistic one, since long boards often cost more per foot. FFD starts every board on the longest length, which is the dearest per foot. The shipped solver matched the exact optimum on all 150 instances in both rows.

On a whole house (345 pieces) the order lands 0.002% above the LP lower bound, and a two-copy run lands 0.014% above it. FFD costs 2.8% more on the one-house case (2,450.00 against 2,384.16 at one price per foot); buying every piece as its own board costs 22% more.

Limits: the instances are synthetic and the prices are a model, not a supplier's list. A real price sheet could change the gap in either direction, and it is the thing the project most wants to test next. Also, the README's two-copy row was stale (503 boards, 0.020%); the run above gives 504 boards and 0.014%, and the README now matches.
