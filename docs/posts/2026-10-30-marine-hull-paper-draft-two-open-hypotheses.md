---
title: "Drafting the marine-hull paper turned up two hypotheses we never tested"
seo_title: "Small survey boat hull comparison: paper draft and untested hypotheses"
date: 2026-10-30
tags: [marine-hull, paper, survey-boat]
description: "After about thirty experiments, writing the paper's results table showed that two of five pre-registered hypotheses were never run as stated."
---

The [marine-hull](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) programme compares hull types for a 200 kg survey craft. Its paper was a 47-line skeleton after roughly thirty logged experiments, so this step ran nothing and wrote the introduction, model and a rung-by-rung results table from the logged numbers.

The table says the catamaran beats the monohull in 3.3% of 6,561 cases and never at equal length. SWATH, planing and hydrofoil rungs win 0 of 4,374, 0 of 48 and 0 of 2,916. The glider beats a propeller AUV only when the AUV carries several times the glider's hotel load.

Writing it exposed gaps. Hypothesis H1 (range varies under 10% across hull constants) was never tested as written, and H5 (a rank swap within the battery range) was never counted. Both are cheap to run with existing code and are next. H3, Holtrop-Mennen against tank data, stays blocked on a reachable data table; one Wigley tank point is the only measurement so far.

Draft and log: `research/marine-hull/paper/DRAFT.md`, `LOG.md`.
