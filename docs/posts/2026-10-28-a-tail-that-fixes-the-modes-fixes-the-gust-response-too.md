---
title: "A sub-scale cargo plane whose tail fixes its flight modes also fixes its gust response"
date: 2026-10-28
description: "In a Froude-scaled 1:5 cargo UAV model, 24 of 78 mode-matched tails also match full-size gust response within 5%; the similar model is 27-33% off in pitch rate."
tags: [research, aerolog-scaling, sub-scale-flight, digital-twin]
---

A Froude-scaled model of a 1,000 kg cargo aircraft keeps the load a gust puts
on the wing (peak load-factor increment within 2%) but not the pitch response:
its peak pitch rate is 27 to 33% high. That was milestone 9a of the
`aerolog-scaling` programme, and none of 17 power-matched wings with the
original tail came within 10% on all three gust metrics.

Milestone 9b lets the tail change as well. Of the 78 tail designs that already
match the three longitudinal modes within 5%, 72 are within 10% on the gust
peaks at a 12.5-chord gradient and 24 are within 5% at all three gust lengths.
The best is within 1.2%. The tail sets the rotational response, so restoring
the modes restores most of the gust response with it.

The caveat is the one the programme keeps repeating: the tail's lift slope
comes from the NeuralFoil surrogate, which ran 22 to 67% above measured UIUC
data for similar sections, and a slope 20% lower breaks the mode match first.
The gust result inherits that. Code, results and the log:
`research/aerolog-scaling/experiments/tail_gust/`.
