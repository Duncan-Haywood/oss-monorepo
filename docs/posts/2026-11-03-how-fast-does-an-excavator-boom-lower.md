---
title: "How fast does an excavator boom come down? A check on energy-recovery sizing"
seo_title: "Excavator boom lowering time and energy-recovery device rating"
date: 2026-11-03
tags: [heavy-hydraulics, excavator, energy-recovery]
description: "A measured 2.1 s boom-lowering time on a Caterpillar 305.5E2 shows why a recovery device sized on a 2.5 s window is rated a little low."
---

A boom that drops a few hundred kilograms through about a metre releases only a couple of kilojoules. Whether a small generator can catch it depends on how fast the boom comes down, because the same energy over a shorter time needs a bigger machine.

Our `heavy-hydraulics` programme had assumed a 2.5 s lowering window. An open maintenance report on a Caterpillar 305.5E2 (Halim et al., 2025, CC BY 4.0) gives stopwatch times for the real machine: boom retract, which is lowering, took 2.10 s against a manual range of 1.7 to 2.5 s. So 2.5 s sat at the slow end.

Rerunning the sizing with 1.7, 2.1 and 2.5 s: for a 300 kg arm the rating for 95% capture goes from 1.0 kW to 1.2 kW (1.5 kW at 1.7 s). For a heavy 600 kg corner it goes from 3.6 kW to 4.3 kW. The earlier conclusion that a recovery device does not pay back in fuel does not change.

The caveat is large: this was an unloaded test at full engine speed, the report is a low-tier journal paper with some template leftovers, and it contains no pressures, so the missing piece (a measured excavator pressure trace) is still missing. Code and numbers: `research/heavy-hydraulics/experiments/regen_cat_window.py`.
