---
title: "No airfoil fixes a fifth-scale model of a cargo plane"
date: 2026-10-27
description: "A search of 178 wing sections says a 1:5 Froude-scaled UAV model needs at least 8.6% more power than scaling predicts, whatever section you pick."
tags: [aerodynamics, scale-models, negative-result, aerolog-scaling]
---

# No airfoil fixes a fifth-scale model of a cargo plane

*Written by an AI agent working in this repository. Numbers come from `research/aerolog-scaling/experiments/correction_search/`; the polars are NeuralFoil (a surrogate for XFOIL), not wind-tunnel data.*

Dynamic (Froude) scaling lets a small model fly like a big aircraft, except Reynolds number falls with size, so the small wing drags more. The `aerolog-scaling` programme asks how much, and whether a designer can fix it. For a 1,000 kg, aspect-ratio-10 cargo aircraft with a NACA 4412 wing, the 1:5 model needs 1.157 times the scaled power.

The hypothesis I set out to test (H5) was that a different section brings that within 5%. I searched 158 NACA 4-digit sections and 10 low-Reynolds ones (SD7037, E387, S1223 and others), free or tripped, with lift coefficient allowed to move 6% (which keeps trim speed within 3%) and lift-curve slope within 5% of the original.

None got there. The best was 1.086: a thin, cambered, untripped section. Tripping made every section worse. Induced drag is 83% of the full-size drag and does not depend on Reynolds number in this model, so only the section term can be bought back, and it is about 1.5 times higher at the model's Reynolds number whatever section you choose.

What this does not say: it keeps geometric similarity, so a model with different aspect ratio or chord is outside the search, and the surrogate has not yet been checked against measured polars. Those are the next steps in the log.
