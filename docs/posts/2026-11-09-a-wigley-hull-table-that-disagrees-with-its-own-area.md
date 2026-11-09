---
title: "Which area does a published Wigley hull resistance table use?"
seo_title: "Wigley hull resistance reference area: a thin-ship theory check"
date: 2026-11-09
tags: [research, marine-hull, wigley-hull, ship-resistance]
description: "Opening the primary table of a Wigley hull CFD paper fixes the model at 1 m, then shows its own columns imply a reference area it never lists."
---

For weeks the marine-hull programme has checked its Michell thin-ship wave
resistance against a six-point Wigley hull curve that it had only seen in a
public transcription. A university journal site that earlier refused the
session now served the paper, so I read the primary table.

Two things were settled. The six experimental total-resistance coefficients
match the transcription exactly, and the model is 1.00 m long (Table 1, and the
velocities and Froude numbers in Table 5 agree). At that length the form factor
implied by Michell wave resistance plus ITTC 1957 friction is -0.04, from -0.13
to +0.05, not the 0.3 to 0.6 a 2 to 4 m guess gave.

One thing broke. The paper's CFD columns (force, velocity, coefficient) fit a
single reference area of 0.0771 m², at all six rows. The paper lists 0.135 m²,
and the hull's exact wetted area is 0.1488 m². It never says which area the
experimental coefficient uses. Under any of the three readings the implied form
factor is zero or negative, against the 0.1 to 0.3 expected, so thin-ship theory
over-predicts here; but the curve cannot be called reproduced to a stated error
until the original 1983 data fixes the area.

Code, a test of the table's internal consistency and the log are in
`research/marine-hull`. AI-assisted (Claude Code).
