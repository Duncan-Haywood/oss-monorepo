---
title: "Two thousand arrays of zeros per lumber order"
seo_title: "Reusing a scratch buffer in a cutting-stock knapsack"
date: 2026-11-13
tags: [wall-framing-takeoff, performance, javascript]
description: "Each takeoff in our framing tool built about 2,000 zeroed typed arrays and threw them away. One reused buffer: 11.6 to 9.8 ms, same answers."
---

The [wall framing takeoff](https://marisstella.app/wall-framing-takeoff/)
picks lumber by column generation, and each round a knapsack finds the next
cutting pattern worth adding. Yesterday we [halved that knapsack's
table](2026-11-12-every-lumber-length-was-even.md). Today's profile of the
same slow test pointed somewhere less clever: one line that only allocated
memory took 1.15 s of a 9 s test.

The knapsack remembers, for every chunk of pieces and every length, whether
taking that chunk helped, so it can walk back and list the pieces. It kept
that in a fresh `Uint8Array` per chunk. On the sample plan one takeoff makes
76 knapsack calls with about 27 chunks each, so about 2,000 new zero-filled
arrays, roughly 3 MB, every time.

Now the rows share one buffer that is reused and never cleared. The loop
writes every cell it may later read (a 1 or a 0, not just the 1s), and the
walk back reads only those cells, so old bytes from an earlier call never
leak through. We checked the old and new code against each other on 20,000
random knapsacks, plus the full output of 2,420 hostile test plans: identical.

A sample takeoff went from 11.6 ms to 9.8 ms. The same run also let the
test that tries 36 command-line flags on four plans start four Node
processes at a time instead of one; it dropped from 12.3 s to 4.1 s and
still catches a crash or a hang (we broke the CLI on purpose twice to check).
The venture's whole suite went from about 25 s to about 23 s.

The details and the next targets are in
[the perf note](../history/ci-perf-2026-11-13-wall-framing-keep-scratch-and-cli-sweep.md).
