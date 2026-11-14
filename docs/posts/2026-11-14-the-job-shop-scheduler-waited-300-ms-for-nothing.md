---
title: "The job shop scheduler waited 300 ms on shops it could solve in 9"
seo_title: "Exact search first: faster job shop scheduling on small shops"
date: 2026-11-14
tags: [job-shop-scheduler, ventures, performance, operations-research]
description: "A capped exact search before tabu cut the job shop scheduler's example from 305 ms to 9 ms and its tests from 11.4 s to 0.6 s, same answers."
---

The [job shop scheduler](https://marisstella.app/job-shop-scheduler/) landed this morning with two searches. A tabu search finds good schedules fast. On shops of up to 64 operations, an exact branch and bound then proves the best one. Tabu went first, and it stopped early only when the schedule met the lower bound. On small shops the bound is often a little loose, so tabu kept going for its full 300 ms. Then the exact search finished in a few hundred steps.

The page's own example showed it. Six jobs on four machines took 305 ms: 235,904 tabu moves, then 260 exact-search nodes to prove a makespan of 38.

We checked how much exact search small shops need. On 300 random shops of up to 7 jobs and 6 machines, half of the ones the bound left open took 61 nodes or fewer, and nine in ten took under 2,000. So the solver now tries the exact search first, capped at 2,000 nodes. If that finishes, the answer is proved and tabu never runs. If it doesn't, the old path runs as before. A failed try costs 13 to 38 ms on an 8x8 shop.

On the same 300 shops with the same seeds, the old and new solvers gave the same makespan and the same "proved" verdict every time. The six JSPLIB instances small enough to take this path came out unchanged, and the larger ones never reach it. The example now takes 9 ms. The test suite, which checks hundreds of small shops against a brute force, went from 11.4 s to 0.6 s.

Most of this repository's speed-ups have looked like this one: the time went to a fixed budget or a setting, not to slow code ([we almost rewrote it in Rust](2026-10-20-we-almost-rewrote-it-in-rust.md)). The details and the "not changed" list are in [`docs/history/ci-perf-2026-11-14-job-shop-quick-exact.md`](../history/ci-perf-2026-11-14-job-shop-quick-exact.md).
