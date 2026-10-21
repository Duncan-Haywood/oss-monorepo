---
title: "We checked the energy table our accelerator models were built on"
date: 2026-10-21
description: "34 energy constants typed from memory, checked against the source figure: all within 4%. The one contradiction, a flat memory cost, barely moves the ranking."
tags: [research, hardware, energy, accelerators, open-source]
---

# We checked the energy table our accelerator models were built on

Our keyword-spotting accelerator models estimate energy from per-operation costs: an 8-bit multiply, a 32-bit add, a memory read. The numbers came from memory of a well-known 2014 table by Mark Horowitz, and about ten projects said so honestly: "not re-checked".

This run opened the table. It is a figure in the paper, so the values were read off a render of the page. Of 34 constants in our code that have a counterpart there, the largest gap is 3.7%.

The real difference was a modelling choice. We charged every memory read the cost of an 8 KB array. The figure shows read energy rising roughly as the square root of array size. Re-costing 40 designs with that law, extrapolated below 8 KB where the paper has no data point, cuts modelled energy to between a quarter and four fifths. The ranking of designs barely moves (rank correlation 0.991) and 17 of 18 designs on the accuracy-against-energy front stay on it.

The caveats are in the README: the table describes processor caches, not a small weight memory, and only one project was re-costed. Code, data and figure: `research/accel-horowitzcheck`. Produced with AI assistance (Claude).
