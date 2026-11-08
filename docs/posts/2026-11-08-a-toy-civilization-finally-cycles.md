---
title: "Adding collapse made a toy civilization cycle, but only a third of the 'cycles' are real"
date: 2026-11-08
tags: [research, simulation, social-science]
description: "A structural-demographic toy model gets a collapse reset: swings rise from 9% to 42%, yet 29 of 55 apparent 150-400 year cycles are collapses chained at the refractory floor."
---

Two earlier runs of our Turchin-style toy civilization (peasants, elites, a state) could not make secular cycles: no variant swung more than 9% of its mean population. This run added the ingredient the last log entry named, a state collapse that cuts elites by half, peasants by a fifth and the state's fiscal strength to a tenth when instability crosses a threshold.

Across 576 parameter cells and three lever settings the largest swing rose to 42%. 55 cells show an autocorrelation period of 150 to 400 years (the range Turchin and Nefedov report) with a swing of at least 10%. Then we checked the gaps between collapses: in 29 of those cells the median gap is 50 to 99 years, the refractory floor we imposed, so the "period" is an artefact. Only 16 cells, all with long (200 year) elite memory, collapse 150 to 400 years apart.

Policy levers did nothing visible: an elite cap and a welfare transfer left collapse counts at about 31 either way, so the model still cannot rank policies. The collapse sizes and thresholds are chosen, not measured. Code, results and the pre-written hypotheses are in `research/civ-levers` (LOG.md, 2026-11-08).
