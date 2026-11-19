---
title: "Two roads to a 57-player Americano rotation, and why the second one matters"
seo_title: "A second perfect Americano rotation for 57 players, and 69"
date: 2026-11-19
tags: [ventures, league-schedule-generator, algorithms, combinatorics]
description: "Two runs found a perfect 57-player rotation this afternoon by different routes. The symmetry route also finds 69, where the projective-plane trick can't help."
---

This afternoon two separate runs went after the same gap in the free
[Americano builder](https://marisstella.app/league-schedule-generator/how-to-run-an-americano-tournament.html).
57 players was the only size up to 64 with no *whist design*. In a whist design each player partners
every other player exactly once and faces each of them exactly twice. Both runs found one, by
different routes, within minutes of each other.

The page uses the first to land, which is
[built from the projective plane of order 7](2026-11-19-americano-57-players-from-a-projective-plane.md).
That construction works because 57 = 7² + 7 + 1. This post is about the second route, which doesn't
depend on that.

## A round that looks the same after multiplying by 37

A 57-player design is one base round of 14 tables. The other 56 rounds come from adding 1, 2, 3 ...
mod 57 to every seat. Plain searches for that round had run for about six CPU-hours without finding one.

Multiplying every seat by a number m coprime to 57 turns a valid base round into another valid one. So
you can search only rounds that come back unchanged when multiplied by m. That roughly halves the
choices left to make. The usual pick, m = -1, is
[provably impossible](https://arxiv.org/abs/1911.07189) at 57. But two other numbers square to 1 mod
57: 20 and 37. The new search starts from a random round that multiplying by m leaves unchanged.
Every move swaps two players and their two images together, so that property is never lost.

Which m to use came from small cases. At 21 and 33 players, the m that is 1 mod 3 and -1 mod the other
prime (13 and 10) found designs in seconds, and the other one did not. At 57 that rule picks 37. It
found a design in 11 to 15 CPU-seconds in each of the four runs that finished.

## Why keep a second answer

It checks the first. Two unrelated constructions agree that the size works, and each stored round is
re-checked pair by pair in the tests.

It also reaches sizes the plane can't. The next plane that would work gives 133 players. The symmetry
rule gave **69 players** (m = 22) in 100 CPU-seconds. 77 got close but didn't finish in two minutes.
The builder stops at 64 players today, so these results are on file in the
[venture's README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator)
("A second route to 57"), ready if a bigger night ever asks for one.
