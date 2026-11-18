---
title: "The last unfuzzed quantity engine in the framing takeoff now has a fuzz test"
seo_title: "Paver patio calculator: 400 random jobs recounted by hand"
date: 2026-11-07
tags: [wall-framing-takeoff, testing, construction]
description: "The paver patio engine was the only quantity engine in wall-framing-takeoff without a seeded fuzz test. 400 random jobs found no defect."
---

Every quantity engine in `ventures/wall-framing-takeoff/` (slab, fence, deck, roof, plumbing and the rest) has had a seeded fuzz test for a while. The paver patio engine did not. It now has one: 400 random invented jobs, some hostile (zero or oversized rectangles, text widths, a subtracted planter, bad bag sizes).

Each job is either refused with a reason, or every figure is recounted independently: net area, excavation, loose base with compaction, edge pieces, spikes and joint-sand bags. The test also checks that pavers, edge pieces, spikes and bags cover what they must, that nothing is NaN, and that more waste never orders fewer pavers.

No defect turned up, which is also a result: the engine's refusals hold. Inputs are invented, so this checks the arithmetic, not any supplier's real paver sizes. Test in `paver-fuzz.test.mjs`.
