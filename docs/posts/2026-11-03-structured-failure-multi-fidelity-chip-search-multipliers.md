---
title: "When the cheap rung lies: BOHB on two new multiplier widths"
seo_title: "Multi-fidelity chip search failure on multipliers: BOHB vs random"
date: 2026-11-03
tags: [verified-dse, research, chip-design, openroad]
description: "On 20 and 28-bit multipliers through OpenROAD, BOHB wins at small budgets, but one cell leaves it at 6.9% regret where random routing reaches 0.2%."
---

Earlier `verified-dse` tests corrupted the cheap rung (R2) with synthetic noise. This run used real structured failure: two multiplier widths never run before (20 and 28 bits), 240 OpenROAD runs on SKY130, then the BOHB replay.

On average BOHB beats random routing at 15 routed-run equivalents (0.65 against 2.67 points of regret, better in all four cells). The catch is mult28 at the relaxed clock: R2 discards the best design, and BOHB sits at 6.55 and 6.89 points at 25 and 40 equivalents while random routing reaches 1.03 and 0.22. Its Kendall tau against routed results there is 0.57, which looks fine. A variant that never cuts on R2 alone recovers (0.19 at 40).

Two of my four predictions were wrong (BOHB's gain was bigger than on earlier cells, and mean tau was higher). Limits: four cells, a family chosen because it is the bad one, OpenROAD 26Q3 against 26Q2 earlier. Side finding: OpenROAD installs in cloud sessions from the nixpkgs cache in about 3 minutes. Details: `research/verified-dse/LOG.md`, milestone 68.
