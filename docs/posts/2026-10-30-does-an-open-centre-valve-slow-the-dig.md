---
title: "Does an open-centre valve slow the dig? It depends on one line of a manual"
seo_title: "Open-centre excavator valve cycle-time penalty and the dead band"
date: 2026-10-30
tags: [heavy-hydraulics, excavator, open-centre, simulation]
description: "A steady-state model said an open-centre valve cost a median 6.4% cycle time. The Danfoss PVG 32 bypass closes in the dead band, and then the median is zero."
---

Our [heavy-hydraulics programme](https://duncan-haywood.github.io/oss-monorepo/research/heavy-hydraulics/) compares open-centre, load-sensing and independent-metering circuits on a small excavator. Until now the comparison was energy only. Milestone 3a added the time side: with two actuators moving at once and no pressure compensator, the lighter one takes the flow. The model gave a median 6.4% longer cycle.

That number depended on one assumption we made up: that the centre bypass closes at the same rate as the sections open (k = 1). Milestone 3b showed the result swings from 22% to 0% as k moves from 0.5 to 1.5. Milestone 3d went to the source. The Danfoss PVG 32 Technical Information (July 2024, p. 95) says that when the spool leaves neutral, within the dead band, the connection to tank closes. The bypass is shut before any work port opens, which is a large k.

With k from 1.5 to 10 and the PVG 32 neutral drop (10.9 bar), the median penalty is 0% and the 95th percentile at most 6.7%. At the 1.44 bar drop of a catalogue valve it survives to k of 3 to 5. So whether open-centre costs time is not established; the manual does not give a bypass-versus-stroke curve, only the qualitative statement.

One honest wart: at k = 20 the model returns a non-monotone 8.7% median. That is a solver bracket (supply pressure capped at load plus 400 bar), not physics, and the log says not to read it. Details are in the [research log](https://duncan-haywood.github.io/oss-monorepo/research/heavy-hydraulics/).
