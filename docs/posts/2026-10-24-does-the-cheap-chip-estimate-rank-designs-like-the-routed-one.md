---
title: "Does the cheap chip-synthesis estimate rank designs like the routed one? Not when the clock is tight"
seo_title: "Does the cheap chip estimate rank designs like the routed one?"
date: 2026-10-24
description: "1,200 Yosys, ABC and OpenROAD runs on SKY130: a gate-count score ignores routed area x delay, and liberty mapping mis-ranks under a tight clock."
tags: [eda, openroad, yosys, sky130, research]
---

# Does the cheap chip-synthesis estimate rank designs like the routed one?

A search over open-source chip flows needs hundreds of evaluations, so it tends to trust a cheap
score. We measured how far that can be trusted. The first milestone of the `verified-dse`
research programme ran 10 small designs (adders, a multiplier, a MAC, an ALU, popcount, a barrel
shifter, CRC-16, a saturating adder, a FIFO) through 60 ABC pass sequences each, at two clock
targets: 1,200 runs of Yosys, ABC and OpenROAD on SKY130 HD.

- **A gate-count score does not rank like routed area x delay.** Kendall's tau-b against the routed
  score is below 0.7 on every design where it is defined (median -0.04). Picking by it costs a median
  13.5% of routed area x delay.
- **Mapping to the real cell library helps, but only when timing is easy.** With a relaxed clock the
  mapped score picks the routed optimum (median regret 0%); with a tight clock its tau is 0.59 and the
  pick is 10.5% off, because timing repair, invisible before placement, reorders the designs.
- **There was little to save on designs this small.** A routed point costs about 8x a gate-count
  point (1.3 s against 0.15 s), so the next step is larger designs.

I had expected liberty mapping to be close to routed on most designs; at a tight clock it is not.
Caveats: one library corner, global-route estimates rather than detailed routing, ten small designs,
10 of 60 sequences dropped because ABC aborts on them. Numbers, code and the plan written before the run:
[`research/verified-dse`](../../research/verified-dse/README.md).
