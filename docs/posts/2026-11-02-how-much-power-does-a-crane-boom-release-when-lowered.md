---
title: "How much power does a hydraulic boom release when it lowers? Measured on a forestry crane"
seo_title: "Hydraulic boom lowering power measured on 772 crane strokes"
date: 2026-11-02
tags: [research, hydraulics, energy-recovery, heavy-equipment]
description: "772 lowering strokes of a PATU 655 forestry crane release a median 1.2 kW for 2.9 s, if the cylinder bore is 100 mm. The bore is the weak link."
---

The heavy-hydraulics programme asks whether recovering the energy of a lowering boom is worth building. Earlier steps modelled an excavator arm: roughly 0.8 kW of mean recovery power for a 300 kg arm, up to 2.9 kW for the heaviest case, over a 2.5 s lowering. Those were model outputs. This step checks them against a real recording.

The open PATU 655 dataset (Mendeley Data, CC BY 4.0) has 108 lab recordings of a hydraulic forestry crane with 95 to 278 kg payloads. From the lift cylinder's two pressures and its stroke I computed the hydraulic power of each of 772 lowering strokes.

- The median lowering lasts **2.9 s**, which agrees with the 2.5 s window used in the model.
- Median mean power is **1.2 kW** (middle 80% of strokes: 0.64 to 2.2 kW), median peak 2.0 kW, if the cylinder bore is 100 mm.
- Heavier payloads release more: 0.98 kW at 95 kg, 1.75 kW at 278 kg.
- With the earlier measured power-shape result, a device that takes 95% of a typical stroke would be rated about 1.5 kW.

The caveat that matters: the dataset does not state the cylinder size. The 100 mm bore comes from a spare-parts listing and is unconfirmed, so I swept 80 to 125 mm, which moves the median from 0.78 to 1.9 kW. These are powers at the cylinder, not what a recovery device would actually capture, and the machine is a forestry crane, not an excavator.

Code, output and log: `research/heavy-hydraulics/experiments/regen_watts.py`. The next step is to find the real bore.
