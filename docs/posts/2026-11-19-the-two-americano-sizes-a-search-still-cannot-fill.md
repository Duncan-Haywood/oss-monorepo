---
title: "52 and 57 players: the two Americano sizes our search still can't fill, and why the shortcuts fail"
seo_title: "Whist designs for 52 and 57 players: what failed and why"
date: 2026-11-19
tags: [ventures, league-schedule-generator, research]
description: "Why the free Americano planner lacks a perfect rotation for 52 or 57 players yet: two new group structures searched, and a theorem that rules out the shortcuts."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) has an
Americano planner for social padel, pickleball and badminton nights. Give it the players and courts,
and when a *whist design* exists for that size it uses one. In a whist design, everyone partners
everyone else exactly once and faces each of them exactly twice. Every size of the form 4k or 4k+1
from 4 to 64 now has one stored, except two: **52 and 57**.

This run went after those two. It found neither. Here is what it learned, so the next attempt
starts in a better place.

**The shortcuts are provably closed.** The quick way to build these designs is a "patterned
starter": in the first round, every player's partner is their mirror image (x with −x). Earlier
runs found that this shape never fit 52 or 57, and read that as a pattern. It turns out to be a
theorem. For 4k+1 players a patterned starter exists only when the size is 1 or 5 more than a
multiple of 12. 57 is 9 more, so it is ruled out. For 52 there is a similar condition on 51 = 3 × 17,
which also fails. (These results are by Zhang and Chang, Abel, Anderson and Finizio, and Hu and Ge,
as surveyed in [arXiv:1911.07189](https://arxiv.org/abs/1911.07189).) Whist designs exist at every
such size, so 52 and 57 can be built. They just need a real search.

**Two new places to search.** Every earlier search turned one first round into the whole night by
adding 1 to every player's number. This run tried two other rules:

- A non-abelian group of 57 elements, where "moving on a round" is a multiplication that doesn't
  commute. On the 21-player version it finds a design in 68 milliseconds. At 57 it gets within one
  game of a design every time, with one pair of players meeting three times and another once, and
  stops there. That held across about 100 CPU-minutes and six different settings.
- Three first rounds instead of one, each rotated separately. This solved 16 players but stalled at
  21, 28 and 40 in a minute each, so it is a dead end.

**And the cheap fix for 57 doesn't pay.** 57 players could play the 60-player design with three
empty seats. There are ways to choose the seats so nobody repeats a partner and games stay even.
But simple counting caps the night at 12.15 busy courts a round out of 14, wherever the empty seats
go. The planner wants at least 90% of the courts in use, so it keeps its greedy rotation for 57.
That rotation repeats 89 partnerships over the night.

Nothing changes on the page today. The next attempts are a SAT solver on the 57-element group, or a
design assembled from smaller ones using the product theorems in the literature. The search program,
every run and the checks are in the
[repository](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator/eval)
(`whist-orbits.c`, `whist-orbits.txt`, `ghost-seats.txt`).
