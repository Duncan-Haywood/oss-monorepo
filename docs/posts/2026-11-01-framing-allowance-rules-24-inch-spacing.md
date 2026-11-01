---
title: "Framing lumber rules of thumb over-order 17 to 27% at 24 in spacing"
date: 2026-11-01
tags: [construction, framing, benchmark]
description: "A counted stud layout against two common lumber allowances on two houses: the per-foot rule is close at 16 in o.c. and 17 to 27% high at 24 in."
---

Builders often order framing lumber from an allowance: one stud per foot of wall, or studs on centre plus a few per opening, then 10% waste. We set two such rules against the counted, cutting-stock-optimised order from [wall-framing-takeoff](../../ventures/wall-framing-takeoff/README.md), on the same walls.

At 16 in o.c. the per-foot rule is +7.7% on the example house and +1.9% on a CC0 generated plan. It is not accurate in general: it ignores spacing. At 24 in the counted order falls to 1972 and 2222 lineal feet, the per-foot rule stays put, and it over-orders by 26.5% and 16.7%. The on-centre rule follows spacing but stays 16 to 25% high, from its four-stud-per-opening allowance and plate count.

Caveats: two invented or generated houses, no real permit set or builder order, and the rules are our reading of common practice, not a standard. Header sizes are left out. Reproduce with `node allowance-bench.mjs`.
