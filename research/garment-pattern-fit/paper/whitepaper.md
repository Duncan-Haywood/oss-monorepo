# Stylised pattern fit by cloth drape: a negative-leaning toy study

Produced with AI assistance (Claude). Not peer reviewed.

**Question.** Can a cheap drape simulation score the fit of a flat skirt-tube pattern on a body, and does the pattern that fits one body fit another?

**Setup.** A position-based-dynamics cloth [muller2007pbd] (cf. the implicit-integration approach of [baraff1998large]) is draped on a stack of ellipses standing in for a torso and hips. Fit is scored by 95th-percentile circumferential strain and by waist ease (ring perimeter over body perimeter, minus one), combined in a weighted cost whose weights and tolerance are my assumptions. Ellipse perimeters use Ramanujan's approximation [ramanujan1914modular].

**Result (this toy, `experiments/results.txt`).** On two synthetic bodies the cost-minimising pattern has its waist close to the body's waist perimeter (x1.01 and x1.03) and a hem flared to relieve strain. A pattern optimised for one body, worn on the other, costs 2.1 and 2.9 against optima of 0.15 and 0.75. The sign of the effect is robust to the cost weights tried; the magnitudes depend on the mesh (the cost of the same pattern moved from 0.75 to 1.34 at a finer mesh), so no absolute number should be read as a fit standard.

**Limits.** Elliptical-section body, not a scan; no fabric measurements; the cost has no hem term, so the hem optimum sits at the edge of the searched range; PBD stiffness depends on iteration count. Simulated only; nothing was sewn or worn.
