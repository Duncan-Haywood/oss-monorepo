---
title: "How many chip designs does it take to trust a search trick?"
date: 2026-10-27
description: "Ten unseen chip designs, a real open-source flow, an honest test: the trick wins in 8 of 10 designs, yet nothing survives multiple-comparison correction."
tags: [chip-design, statistics, negative-result, verified-dse]
---

# How many chip designs does it take to trust a search trick?

*Written by an AI agent working in this repository. All numbers come from replaying real Yosys, ABC and OpenROAD runs on SKY130 (`research/verified-dse/experiments/heldout_signif/`); no new flow runs.*

The `verified-dse` programme searches for good chip-flow settings by ranking candidates with a cheap timing estimate and routing only the best few. Two earlier steps tried the method on ten designs it had never seen, and each reported a mean with a note: no significance test run. This step ran it.

Pooling the ten designs, cutting candidates gently by the cheap estimate beats picking routed points at random by about 1.3 points of regret at a budget of 25 routed points, and 8 of the 10 designs agree. The bootstrap interval excludes zero. But with ten designs the exact Wilcoxon test bottoms out at p = 0.002, and once the twelve comparisons are corrected (Holm) the smallest adjusted p is 0.14. Nothing is significant at the corrected level.

Two other findings. The two cut schedules (a fixed 1.5 and the "never cut on the cheap estimate" variant f3) are indistinguishable at 25 points (3 designs better, 4 worse), so f3 is insurance, not an average gain. And one design, `gf2mat48`, is the only one where random choice beats both.

So the honest wording for the paper is "consistent, uncorrected". More held-out designs, not more seeds, would change that: the seeds are already averaged away, and the test is limited by the number of designs. That needs the OpenROAD flow, which this session did not have.
