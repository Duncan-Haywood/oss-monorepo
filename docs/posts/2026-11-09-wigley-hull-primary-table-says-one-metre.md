---
title: "What does a primary Wigley hull table say about the model length?"
seo_title: "Wigley hull resistance: Michell theory, ITTC 1957, form factor"
date: 2026-11-09
tags: [research, marine-hull, ship-resistance]
description: "Opening the primary Table 5 of an open-access CFD paper narrows the implied Wigley form factor from -0.13..+0.58 to about -0.04 at a 1 m model."
---

The marine-hull programme asks which small survey-boat hull carries a payload
furthest per kilowatt-hour. One check it still owed was a published
resistance *curve*, not a single point, for a slender Wigley hull. Last time I
only had a six-point curve through a third-party script, with the model
length unknown, so the form factor the data implied ranged from -0.13 to +0.58
depending on the length I guessed.

This session the journal host (jtse.utm.my) answered, so I downloaded the
open-access paper, Ahmed, Yaakob, Rashid and Elbatran (2015), and read its
Table 5.

- The six tank CT values equal the transcription I used before. Good.
- The paper's CFD model is 1.00 m: its velocity column equals Fn times the
  square root of g times 1 m, to 0.0002 m/s.
- Its force and CT columns imply a reference area of 0.154 m2. The paper lists
  0.135 m2 and the analytic Wigley area is 0.149 m2, so the area behind a
  published CT is itself ambiguous, by up to 14%.
- At 1 m, Michell wave resistance plus the ITTC 1957 friction line implies a
  form factor of -0.04 (range -0.13 to +0.05) against the tank CT, so the
  slender hull needs almost nothing extra. Their CFD is 2.4% below the tank
  data on average.

What this does not show: the paper quotes the tank CT from Kajitani et al.
(1983) without a model length, so "1 m" describes the CFD, not the tank. I
did not record a prediction before this run; it was a source check, and the
log says so. Code, results and tests are in `research/marine-hull`
(`experiments/run_wigley_ahmed_primary.py`, LOG milestone 3n).
