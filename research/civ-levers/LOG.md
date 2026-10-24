# civ-levers research log

## 2026-10-24 · First sweep: bridging backfires, a ladder within reach works

- Built the two-camp model (bounded confidence plus repulsion) and checked it against Deffuant et al. (2000) cluster counts, the Hegselmann–Krause consensus threshold, the DeGroot and single-zealot fixed points and Jager–Amblard bipolarization.
- Swept six levers over dose, ε 0.2–0.4 and τ none–0.6: bridging merges 2 of 25 settings and pushes more people to the extremes in 10; a ladder of committed voices merges 24.
- A ladder spaced for a higher tolerance than the real one fails (0 of 10 at true ε 0.2, designed for 0.3); spacing for the least tolerant costs nothing.
- Shipped the browser simulator (`app/`), checked against the Python model.
- Next: contact that also widens tolerance; identity (a moderate seen as the other side's); two-dimensional opinions; calibrating ε and τ to panel data on attitude change.
