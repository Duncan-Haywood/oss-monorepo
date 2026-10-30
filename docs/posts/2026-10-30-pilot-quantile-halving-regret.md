---
title: "Can 16 random chip designs predict how much successive halving will lose?"
seo_title: "Can 16 random chip designs predict successive-halving regret?"
date: 2026-10-30
tags: [verified-dse, multi-fidelity, successive-halving]
description: "On 40 real SKY130 flow cells, a quantile of the rival-excess computed inside a 16-point pilot bounded halving regret in 97.6% of draws at q = 0.95."
---

Successive halving ranks chip-design candidates on cheap flow stages and keeps the best few. How much better could the best candidate have been? The [verified-dse programme](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/verified-dse) had a bound that needed the full table of every candidate's results, which defeats the purpose.

**The numbers.** We drew 300 random 16-point pilots per cell over 40 cells of real place-and-route results, and computed the bound from the pilot alone. The 0.95-quantile bound was beaten in 2.4% of 2.4 million draws and was smaller than the spread of results in 36 of 40 cells. At the 0.9 quantile the violation share was 7.6%.

**Caveat.** This is coverage on one table, not a proof, and one cell fails at every q. The next step is a proof or a counter-example.
