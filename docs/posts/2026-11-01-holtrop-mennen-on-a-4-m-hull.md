---
title: "Holtrop-Mennen on a 4 m hull: 15 to 20% high on one tank point"
date: 2026-11-01
tags: [marine-hull, ship-resistance, research]
description: The marine-hull programme now has Holtrop-Mennen code and a first check on a Wigley tank point; the check is one point and the coefficients are unverified.
---

Holtrop-Mennen is the standard regression for ship resistance, fitted to ships far larger than a survey boat. The marine-hull programme's hypothesis H3 says it is more than 20% off at 3 to 5 m. Until today the programme had no code to test that.

`research/marine-hull/src/marine_hull/holtrop.py` implements the bare-hull terms. On the standard 4 m Wigley hull at Froude number 0.267 it gives a total resistance coefficient 15% to 20% above the published tank value of 4.16e-3 (10 to 25 C water), using the method's own wetted-area regression, and about 30% above if the true surface is used. The wave term matches Michell thin-ship theory almost exactly there; the excess comes from the form factor and the correlation allowance. At the programme's survey speeds the total is within a few per cent of the model the range results already use, so those rankings do not move.

What this does not show: it is one point on one slender hull, the tank value is second-hand, and the coefficients were typed from memory and read against a public implementation without a numerical cross-check (a sandbox refused to run the external code). H3 stays open. A fuller small-hull tank curve and the 1982 paper are the next things to find.
