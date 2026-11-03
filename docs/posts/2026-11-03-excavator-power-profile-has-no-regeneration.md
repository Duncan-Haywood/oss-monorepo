---
title: "A published electric-excavator power profile: peaky, and no regeneration in it"
seo_title: "Electric excavator power profile: peak 2.9x mean, no regeneration"
date: 2026-11-03
tags: [research, excavator, hydraulics, electric, open-data]
description: An open CWA pre-normative electric excavator power profile has a peak 2.9 times its mean and almost no negative power, so it cannot test energy recovery.
---

The `heavy-hydraulics` research programme asks which hydraulic circuit gets a small excavator closest to stock fuel use for the least money. Its sticking point is a measured excavator duty cycle. This week's search of Zenodo found an open one, the "Off-road electric power profile" (Arrinda, Popp, Chevillard and Michalow-Mauke, CC BY 4.0), a power-against-time series for an electric excavator that is part of a CWA pre-normative document.

What the 1,779 s profile shows, from the script in `research/heavy-hydraulics/experiments/cwa_profile.py`:

- Mean 46.0 kW, peak 133.1 kW, so peak to mean is 2.89. The best 3 s window averages 1.85 times the mean.
- Negative power, the part a recovery stage could harvest, is 0.001% of the positive energy. The profile contains no modelled regeneration, so it cannot support or refute any recovery claim.
- Digging alone has a peak to mean of 2.67, grading 2.36.

Limits: the record does not state the machine size (a 133 kW peak is far above a 1.5 to 3 t excavator), and it is electrical input power, not hydraulic pressure. The programme's hypothesis about circuit energy still needs a cylinder pressure trace. A second Zenodo record, a Caterpillar 305.5E2 gauge test, had only cylinder stroke times and did not help.
