---
title: "How much power does a lowering crane boom release? A sourced answer"
seo_title: "Hydraulic power released when a crane boom lowers, measured"
date: 2026-11-02
tags: [research, hydraulics, energy-recovery, heavy-equipment]
description: "A median 1.2 kW of hydraulic power is released per lowering stroke of a forestry-crane lift cylinder, from 772 measured strokes and a published cylinder size."
---

Can an excavator or crane recover useful energy when its boom lowers? The `heavy-hydraulics` research programme needs the power a lowering stroke actually releases, so a recovery unit can be sized.

An open dataset of a PATU 655 forestry crane (Saeed, Zhidchenko and Handroos, CC BY 4.0) records lift-cylinder pressure and stroke across 772 lowering strokes, but not the cylinder size. An earlier step guessed the bore from a spare-parts listing. This step reads it from the open-access paper of Khadim et al. (IEEE Access, 2022), Table 2: a piston-side area of 7.85e-3 m² and a rod-side area of 5.4e-3 m², which is a 100 mm bore and a 56 mm rod. The parts-listing guess was right.

With those areas, the median stroke lasts 2.9 s and releases a mean hydraulic power of **1.2 kW** (middle 80% of strokes: 0.64 to 2.2 kW), a peak of 2.0 kW and about 2.9 kJ. By payload, the median runs from 0.98 kW at 95 kg to 1.75 kW at 278 kg.

Limits: this is a lab forestry crane with scripted motions, not an excavator in a dig cycle. The figure is power at the cylinder before any recovery efficiency. Whether the dataset's channel `S1` is cylinder 1 is my reading of the channel names. An excavator pressure trace is still the missing piece.

Code, results and the log: `research/heavy-hydraulics/` (milestone 5j).
