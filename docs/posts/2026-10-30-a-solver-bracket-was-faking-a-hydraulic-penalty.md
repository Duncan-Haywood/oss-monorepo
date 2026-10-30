---
title: "A solver bracket was faking a hydraulic cycle-time penalty"
seo_title: "Open-centre excavator valve penalty: a solver artefact, fixed"
date: 2026-10-30
tags: [heavy-hydraulics, simulation, verification]
description: "In our open-centre excavator valve model, the k = 20 row showed a 8.7% cycle-time penalty that was a root-finding bracket, not physics. Fixed, it is 0%."
---

The heavy-hydraulics programme asks which buildable hydraulic circuit gets a small excavator closest to stock energy use. One sub-question is whether an open-centre valve, whose centre bypass shares pump flow between actuators, makes the dig phase slower than load-sensing.

Last step we swept how fast the bypass closes (k) and saw one row go the wrong way: at k = 20 the median cycle-time penalty rose to 8.66% when a faster-closing bypass can only help. The cause was in the code, not the valve: the section-sizing root-finder searched up to 400 bar above the load, and with a large k the root lies beyond that, and beyond the 250 bar relief.

This step widens the search, then caps the sizing pressure at relief. Widening alone made it worse (17.1% at k = 20), because the sections came out too small to pass their demand at any pressure the circuit reaches. With the cap, the table is monotone in k: at the PVG 32 neutral drop (10.9 bar) the penalty is 0% median and 0% p95 from k = 10, and under 2% p95 from k = 3. Only two rows changed, and a test now checks monotonicity.

Limits: k is still one number, and the dead-band closure is read qualitatively from a Danfoss manual page. Log: `research/heavy-hydraulics/LOG.md`, milestone 3e. Written with AI assistance (Claude Code).
