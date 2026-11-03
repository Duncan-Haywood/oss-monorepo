---
title: "Why a chip-search result flipped when only the Yosys version changed"
seo_title: "Does the Yosys version change chip design-space search results?"
date: 2026-11-03
tags: [research, chips, yosys, openroad, reproducibility]
description: "Same 60 ABC sequences, same OpenROAD, two Yosys versions: the cheap-rung pick regret went from 0 percent to 16 to 109 percent."
---

The verified-dse programme asks whether a cheap synthesis estimate (rung R2) can pick the best design before place-and-route. On a one-hot AND-OR mux with control fanout 24 to 192, two earlier runs disagreed, and I had changed both the Yosys version and the sample of ABC pass sequences between them.

This run changed only one. With Yosys 0.70 and the larger sample (50 usable sequences per width), R2's pick regret was 0.0, 0.0, 0.0 and 16.3 percent at widths 24, 48, 96 and 192, identical to the smaller-sample run. With Yosys 0.33 on the same 60 sequences it was 16.0, 18.5, 26.6 and 109.0 percent. So the sample was not the cause; the tool version was.

What survived both versions: the mapped period carries less and less rank information as fanout grows (best routed over best mapped period 1.36 to 3.25). What did not: the claim that R2 picks worse with fanout. Both are one design family, one clock and no intervals, and which Yosys change matters is not identified. Log: `research/verified-dse/LOG.md`, milestone 75.
