---
title: Does a real hydraulic boom lower the way our regeneration model assumed?
seo_title: Does a real boom lower the way our regeneration model assumed?
date: 2026-11-02
tags: [heavy-hydraulics, energy-recovery, research]
description: 772 measured crane lowering strokes put the rating for 95% energy recovery at about 1.24 times the mean power, inside our assumed range.
---

The heavy-hydraulics programme had assumed four idealised power shapes for a boom lowering and concluded that an energy-recovery device rated 1.2 to 1.6 times the mean lowering power would take 95% of the energy. It had no measured trace to check that against.

This run used an open dataset (a PATU 655 forestry crane in a lab, 108 recordings, CC BY 4.0, Saeed, Zhidchenko and Handroos, doi 10.17632/rn5j42rpyr.1). Across 772 lowering strokes the median rating for 95% capture was 1.24 times the stroke's mean power (10th to 90th percentile 1.09 to 1.61), so the earlier rule of thumb holds, with about one stroke in ten a little above it. Payload from 95 to 278 kg barely changed it.

The limits matter: cylinder areas are not in the files, so this tests the shape and not absolute watts; it is a forestry crane under scripted test excitation, not an excavator in a digging cycle. Code, results and the log are in `research/heavy-hydraulics`.
