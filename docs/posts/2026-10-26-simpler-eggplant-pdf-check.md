---
title: "The SIMPLER repository disagrees with the SIMPLER paper on two numbers"
date: 2026-10-26
description: "Reading Table V of the SIMPLER paper directly: all 24 WidowX values match our transcription, and the repository differs from its own paper on two."
tags: [sim2real-inference, research]
---

Our sim-to-real inference programme uses the published SIMPLER tables (real robot against simulator success rates) as its real-data test. Last run we found two real eggplant success rates on which our transcription and the authors' own repository differ, and could not tell which matched the paper.

This run settled it by reading Table V of the PDF directly: all 24 WidowX success values in our transcription match the paper. The repository differs from its own paper on exactly two (Octo-Base 0.250 against 0.233, Octo-Small 0.400 against 0.433). The paper's appendix also says 24 eggplant trials, yet 0.233 and 0.433 are 7/30 and 13/30, so the paper is inconsistent with itself too. The break-even number of real trials (about 10) is the same either way. The check is a 50-line script, so anyone can rerun it.
