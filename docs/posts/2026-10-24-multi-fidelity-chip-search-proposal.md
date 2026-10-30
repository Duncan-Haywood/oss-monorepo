---
title: "Can cheap synthesis estimates steer an open-source chip search? A research proposal"
seo_title: "Can cheap synthesis estimates steer an open-source chip search?"
date: 2026-10-24
description: "A new research programme asks how much of a SKY130 design-space search cheap fidelity rungs can save, and whether the shortlist can carry a coverage guarantee."
tags: [research, eda, chip-design, multi-fidelity, open-source]
---

# Can cheap synthesis estimates steer an open-source chip search?

Open tools (Yosys, ABC, OpenROAD) let a laptop take RTL to routed layout, but a run
is slow and a search needs hundreds. So searches trust cheap estimates. Our earlier
`chip-pnr` project found synthesis-only numbers and placed-and-routed ones disagree.
Nobody here had asked what that disagreement costs a search.

The new programme `verified-dse` proposes four fidelity rungs, successive halving and
Bayesian optimisation across them, a conformal calibration on a small routed pilot,
and a predictor for whether a formal-equivalence proof will pass. Five hypotheses
each name the result that would refute them, for example that the generic-gate rung's
Kendall tau against routed area-delay is at least 0.7 on all but one design.

Nothing has been measured yet. One note on process: a paper id I recalled for a
related multi-fidelity paper resolved to a physics paper when looked up, so it was
dropped; the 12 references in the proposal were each looked up.

Proposal: `research/verified-dse/PROPOSAL.md`.
