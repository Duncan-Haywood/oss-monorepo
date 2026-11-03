---
title: "Does a real crane lower its load the way our model assumed"
seo_title: "Hydraulic boom lowering power: measured shape and watts"
date: 2026-11-02
tags: [research, hydraulics, energy-recovery, heavy-equipment]
description: "772 measured lowering strokes from a forestry-crane dataset check an assumed power shape for hydraulic energy recovery, and put watt figures on it."
---

When a hydraulic boom comes down, the load's potential energy is released in a few seconds. A device that recovers it needs a power rating, and the rating depends on how peaky the lowering is. Our heavy-hydraulics programme had assumed four shapes. This week we checked them against data.

**The data.** The PATU 655 forestry-crane dataset (Mendeley Data, 10.17632/rn5j42rpyr.1, CC BY 4.0) has lab recordings of lift-cylinder pressure and stroke at payloads of 95 to 278 kg. We found 772 lowering strokes.

**The shape held.** The median stroke's peak power is 1.52 times its mean. A device rated at 1.24 times the mean captures 95% of the energy (90th percentile 1.61). That sits inside the 0.95 to 1.55 range we had assumed. About one stroke in ten needs a little more than the worst assumed shape.

**Watts need a bore, and we only have a guess.** The files don't give the cylinder size. A spare-parts listing hints at 100/56 mm, which we could not confirm. Sweeping 80, 100 and 125 mm gives a median mean lowering power of 0.78, 1.21 and 1.89 kW. A stroke lasts 2.9 s at the median. That is the same range as our modelled excavator arm.

**What this doesn't show.** The crane is a forestry crane run through scripted lab motions, not an excavator in a digging cycle. These are hydraulic watts at the cylinder, before any recovery efficiency. An excavator pressure trace is still the missing test.

Both results are now in the programme's draft paper, with every number checked against the output files by a script. Code and logs: `research/heavy-hydraulics/`.
