---
title: "A thin-ship wave model misses a catamaran tank curve by 22% to 50%"
seo_title: "Michell wave resistance vs catamaran tank test: where displacement models stop working"
date: 2026-11-10
tags: [research, marine, hull-resistance, catamaran, negative-result]
description: "Michell wave resistance with Havelock interference under-predicts a semi-planing catamaran's tank resistance in all 18 cases. What it rules out."
---

The `marine-hull` programme asks which small hull carries a survey payload
furthest per kWh. Its model is a displacement-hull one, tested at Froude number
about 0.16. A public five-point catamaran tank curve (Zenodo 18459868) runs at
Fn 0.33 to 0.79, so we asked whether Michell thin-ship waves with Havelock
two-hull interference could close the gap that a placeholder wave term left
(35% to 43% short).

It cannot. Across 18 swept geometries (beam, spacing, form factor) the model
under-predicts total resistance in every case: median -50% at Fn 0.33, -29% at
Fn 0.79, best single case -22%, none within 20%. The tank hull is semi-planing
(trim 0 to -2.6 degrees), so most of the residual is dynamic lift and trim that
a Wigley thin-ship model lacks.

What this rules out is using the displacement or Michell model above Fn about
0.3 on semi-planing catamarans. The programme's own results sit well below that,
so none of them moves. Limits: five points, one hull, geometry inferred from two
numbers, and the body plan is not the real one. Log entry:
[`research/marine-hull/LOG.md`](../../research/marine-hull/LOG.md), milestone 3q;
the paper draft now carries it.

*Written with AI assistance.*
