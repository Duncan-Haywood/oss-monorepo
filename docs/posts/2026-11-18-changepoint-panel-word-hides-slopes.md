---
title: "Scored where it switches on, the panel shape word hides a donor's own slope"
seo_title: "A panel-relative gap word hides slopes in compounding panels"
date: 2026-11-18
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "A pre-registered re-test on 32,000 simulated panels: read against a compounding panel, a donor's own big slope is called 'held' 90% of the time."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) runs synthetic controls. When a donor ranks above the treated unit, the report puts a word to that donor's own gap after the date: **faded** (a pulse that wore off), **grew** (a slope from the date) or **held**. The word is a hint about what kind of event to look for in that donor.

On long compounding series such as GDP per head, nearly every gap grows, so the plain word names almost everyone. [Earlier today](2026-11-18-changepoint-shape-word-against-the-panel-as-an-option.md) a panel-relative word shipped as an opt-in, `--shape-word panel`. It reads each unit's gap growth against the median unit's once that median would itself be called "grew". It stayed off the default because it missed one pre-registered bar by 0.4 points. That bar was pooled over every wandering panel, and the two words are identical wherever the rule stays off.

## The re-test

This round scores only the panels where the rule switches on, and asks something the first round did not: where the panel word is in force, is a donor with its own event worded more often than a clean unit?

The [pre-registration](../../ventures/changepoint-detector/eval/synth-shape-switch-prereg-2026-11-18.md) was committed after an exploratory run and before the confirmatory one. The confirmatory run used a fresh seed, 80 cells and 32,000 panels, including two growing generators the first round did not have. On the 5,982 switched growing panels:

| | plain word | panel word |
|---|---|---|
| clean units given a word | 67.5% | **28.9%** |
| pulse donors called "faded" | 71.5% | **92.6%** |
| big slope called "held" | 7.2% | **89.6%** |
| slope donors given any word, minus clean units | +20.3 pts | **-14.7 pts** |

Three bars held: fewer clean units worded, pulses named at least as well, and the first bar again in each generator separately. Two failed: slope lift, and whether a slope donor is worded at least as often as a clean unit. The exploratory run had predicted both failures, and the pre-registration kept those bars anyway.

## Why slopes vanish

A donor's own slope from the date grows linearly. A compounding gap grows faster. Measured against the panel's centre, a linear slope looks ordinary, so the panel word calls it "held", which reads as "nothing of its own". The first round's 33% "grew" for slopes was pooled over growing panels where the rule was mostly off. Where it was on, the figure is 9%.

## What changed

The plain word stays the default. Under `--shape-word panel`, each listed unit now also carries its plain word (`plainShape` in `--json`). Where the two words differ, the report gives both. On West Germany 1990 it now reads: "the Netherlands ... its own gap held against the panel's growth, but grew towards the end on its own reading". The note quotes the switched-panel rates and says that a unit held against the panel but grown on its own reading is the one to check for a slope. The test and its p do not change.

Neither word works alone. The plain word flags slopes but also words two thirds of clean units. The panel word stays quiet and names pulses, but it cannot see slopes. The next step is a word that reads curvature, so a linear slope can be told apart from compounding growth.

Every number here comes from `eval/synth-shape-switch-confirm.out.txt`, and `synth-shape-switch.test.mjs` checks each bar against that file. The README section is "The panel word scored where it switches on".
