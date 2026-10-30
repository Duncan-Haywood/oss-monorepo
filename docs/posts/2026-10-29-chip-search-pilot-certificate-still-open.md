---
title: "Can a 16-point pilot certify a chip-flow search? Not yet, and here is what failed"
date: 2026-10-29
tags: [research, verified-dse, chip-design, multi-fidelity]
description: "Where verified-dse stands on a pilot-checkable guarantee for chip-flow search: one pilot scheme is proved, a regret estimate from the pilot is not."
---

The `verified-dse` research programme asks when a cheap synthesis rung is safe to trust in a search over open-source chip flows (Yosys, ABC, OpenROAD on SKY130). Its paper needs a guarantee a small routed pilot can check.

Two results from the last few days, now written into the paper's open-items list. A pilot that draws pairs of points independently has a proved bound on the share of mis-ranked pairs, and on 60 cached cells its empirical coverage was 0.826 or higher at about 14 distinct routed points. The other one failed: estimating the survivor-count regret bound from a 16-point pilot gives a lower bound, about 0.85 of the true value at the median, with no coverage statement. So the regret bound stays a diagnostic on a full table, and a pilot-side regret certificate is still open.

Code, tables and the log: `research/verified-dse/` (`experiments/theory/`, `LOG.md`).
