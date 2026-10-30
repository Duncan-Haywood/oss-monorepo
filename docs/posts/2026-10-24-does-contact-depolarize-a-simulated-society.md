---
title: "Does contact between two camps depolarize a society? In simulation, only if nobody backfires"
seo_title: "Does contact between two camps depolarize a society?"
date: 2026-10-24
description: "Six depolarization levers in a simulated two-camp society: cross-camp contact can backfire, while a ladder of voices within reach merges the camps."
tags: [polarization, opinion-dynamics, simulation, research, social-psychology]
---

# Does contact between two camps depolarize a society? In simulation, only if nobody backfires

Put two camps in touch and they will come together: that is the hope behind a lot of
depolarization work. The evidence on hearing the other side is split. Bail et al. (2018)
found Republicans who followed a bot retweeting Democrats became more conservative; Guess and
Coppock (2020), across three large survey experiments, found little backlash. Opinion-dynamics
models hold the same disagreement in one number: how far away a view must be before it
pushes people *away* instead of drawing them in.

The new open project `civ-levers` does not pick a side. It builds a society of 1,000
simulated people in two camps (opinions near 0.2 and 0.8 on a 0-to-1 scale, 95% of ties inside
their own camp), lets them influence each other under bounded confidence (Deffuant et al.
2000) with optional repulsion from distant views (Jager and Amblard 2005), and sweeps both
thresholds. The model first reproduces two published results: Deffuant's rule of about
1/(2ε) opinion clusters, and the Hegselmann–Krause consensus threshold near ε = 0.25. Then it
tries six levers across 25 settings, 10 societies each.

**Bridging contact is the one lever that backfires.** With no repulsion, the other camp is
too far away to influence anyone, so rewiring even half of all ties across the divide merges
nothing (unless tolerance reaches 0.4). With people rejecting views more than 0.7 away,
rewiring just 10% of ties drives *everyone* to the extremes, against 10% with no intervention.

**What works is a voice within reach.** A moderate broadcast or committed moderates at the
centre merge the camps in 19 of 25 settings, and as little as 5% does it once tolerance is
0.3. A *ladder* of committed voices, stepping stones spaced within tolerance from one camp to
the other, merges them in 24 of 25 and never pushes anyone to the extremes. One catch: space
the ladder for the least tolerant people. Built for a tolerance of 0.3 when the real one is
0.2, it merges none of 10 societies; built too cautiously, it costs nothing.

These are simulated people following a stated rule, not a forecast. Tolerance, backfire and
the network are swept because nobody has measured them for real attitudes, and "contact"
here changes opinions, not prejudice, which is what the contact-hypothesis literature measures
(Pettigrew and Tropp 2006). The next experiments give contact a tolerance-widening effect and
give moderates a camp identity.

You can try every lever yourself in the
[depolarization simulator](https://duncan-haywood.github.io/oss-monorepo/research/civ-levers/app/).
Code, tests and results: [`research/civ-levers`](https://duncan-haywood.github.io/oss-monorepo/research/civ-levers/).
