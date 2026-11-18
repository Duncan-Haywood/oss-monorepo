---
title: "Straight studs, and still 74%: what caps a sheathing robot on single-stud joints"
date: 2026-11-13
tags: [buildbot-sheathing, construction-robotics, tolerance-analysis, shapley, simulation]
seo_title: "Why a sheathing robot misses nails on a single 2x joint stud"
description: "On straight studs a sheathing robot gets 74–81% clean sheets on single 2x joints. The nail gun and the sheet pose share the blame and fail only together."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails where the code and the panel maker want them. The hard part is the 34 joint nails, which sit 3/8 in in from a sheet edge on a stud that two sheets share. With the recommended 1/8 in gap between sheets, a single 2x joint stud leaves each nail about ±3 mm.

This morning's step pushed bowed joint studs straight before nailing. It removed what bow was costing, but single-2x joints still stopped at **74–81% clean sheets**, the same as on perfectly straight studs. We said the sheet's pose on the ledger was what was left. We hadn't checked. This step checks. It switches each of the six remaining error sources on and off, in all 64 combinations at 20,000 sheets each, and splits the misses between them by Shapley value.

- **The nail gun carries about half.** The tool's 0.9 mm scatter takes **45–47%** of the misses. The sheet's pose (where the slide left it, the ledger's slope and the panel's own squareness and edge bow) takes **39–44%**. The stud and edge readings take the rest. So the earlier reading was half right.
- **Neither one misses alone.** With a perfect tool the real pose gives 99.5–100% clean sheets. With a perfect pose the real tool and readings give 95.7%. Together they give 74%. Every millimetre the sheet sits off its intended place narrows one side of the ±3 mm window by half a millimetre. A tool error that would have landed then lands outside.
- **Two placement steps help a lot, but not enough.** Before tacking, the robot reads both sheet edges and **slides** the sheet along the ledger to centre its gap on the studs. It then **shims** the low corner until the edge reads plumb. With half-millimetre residuals this lifts straight studs to **92%** (94% at a quarter millimetre) and pushed, ordinarily bowed studs to **89%**. We had predicted 95% and logged that before the run. It was refuted.
- **95% needs a tighter tool too.** With the slide and the shim, the nailer must hold about **0.8 mm** (1σ) instead of the 0.9 mm we have used throughout. Without them it would need 0.4–0.66 mm.

For a builder, the practical answer hasn't changed. Doubling the joint stud gives 99.9–100% clean sheets with none of this. For anyone building the robot, the order of work on single studs is now clear: slide, shim, push the stud, then get a nailer that is about 10% tighter. The 0.9 mm figure comes from one source, so the next useful measurement is the scatter of a real nailer on a real arm.

This is a model, not a measurement. The slide and shim accuracies are swept, not taken from any machine, and the shim is modelled as a residual, not as a mechanism. Shapley shares depend on the scale used (here, the log of the clean-sheet rate). The pre-registered plan, code, numbers and figure: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
