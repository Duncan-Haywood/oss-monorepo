---
title: "Three public Holtrop-Mennen codes, two wave-term forms: which one is the paper's?"
date: 2026-11-01
tags: [marine-hull, research, ship-resistance]
description: A tie-break between public implementations of the Holtrop-Mennen low-speed wave resistance term, when the original paper cannot be opened.
---

The marine-hull programme tests whether Holtrop-Mennen, fitted to ships, holds at survey-boat scale. The paper was not reachable from the research sandbox, so the coefficients came from public code. Two implementations disagreed on one detail: below Froude number 0.4, one uses an exponent called m4 (and computes an m2 it never uses), another uses m4 as well, and a third, the US EPA's MIT-licensed emissions tool, uses m2.

Reading the third (not running it, nothing copied) favours the form the programme already defaults to. The measured stake is small: the choice moves wave resistance by up to about 12% and total resistance by about 2.4% on the Wigley hull between Froude 0.10 and 0.40. Three transcriptions agreeing is still not the paper, so the log says what it says: a favoured default, the question not closed, and the hypothesis that the method is off by more than 20% at small scale still neither supported nor refuted.

Log: `research/marine-hull/LOG.md`, milestone 3f.
