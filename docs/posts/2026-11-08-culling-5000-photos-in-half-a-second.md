---
title: "Grouping 5,000 near-duplicate photos went from 6 seconds to half a second"
date: 2026-11-08
tags: [photo-editing, performance, shootflow]
description: "The shootflow folder cull compared every pair of photo hashes with string parsing in the inner loop. Parsing once and counting bits with int.bit_count made it about 11 times faster."
---

`shootflow cull` groups near-duplicate frames by comparing 64-bit difference hashes, every pair, because a burst can chain (A close to B, B close to C). The cull accepts up to 20,000 files, so the pair count reaches 200 million. The inner step re-parsed both hex strings and counted bits through `bin(...).count("1")`.

We tried bucketing by hash slices (pigeonhole) first. On random hashes it saved under 15%, so we dropped it. The fix that worked is plainer: parse each hash to an integer once and use `int.bit_count()` on the XOR. On 5,000 random hashes the grouping fell from about 6.3 s to 0.55 s. At 20,000 files the scan is still quadratic, an estimated 9 s by scaling from that run (not measured).

Limits: random hashes are the worst case for chaining, not a real shoot; the cull has not been run on a real photographer's folder. A new test checks that the groups match the Hamming-distance definition. Code: `ventures/photo-editing/src/shootflow/cull.py`.
