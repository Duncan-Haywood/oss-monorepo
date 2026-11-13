---
title: "Double the current and the cheap battery model breaks on four designs in five"
date: 2026-11-13
tags: [cell-fidelity, batteries, simulation, multi-fidelity, pybamm, pre-registration]
seo_title: "When to skip SPMe and run DFN: a pre-registered test at 2C"
description: When should a battery design search drop the reduced SPMe model? Current mattered as much as the cell, and the gate we wrote down picked wrong twice.
---

The `cell-fidelity` programme asks when a lithium-ion electrode design search can trust PyBaMM's SPMe, a cheap reduced battery model, instead of the full DFN model. The last step left a rule that works: run SPMe on every candidate design, then run DFN on the ones SPMe probably got wrong (runs that failed, then the most salt-depleted), until three in a row check out.

It left two questions open. On some cells nearly every design is one SPMe gets wrong, so running SPMe first wastes time. Can the first few SPMe runs tell you to skip it? And the rule's way of naming the winner had to be fixed after the fact. Does the fix hold up?

A parallel run asked the same question at the usual current (milestone 5f). This one moved the current instead. We wrote five tests down first, then ran 768 simulations at operating points no earlier run had used: five cells at twice the current (about 2C) and one at half. By chance both runs drew the same 64 designs, so on three cells we can compare the same designs at two currents.

**Current decides as much as the cell does.** Doubling the current raised the share of designs where SPMe fails or runs out of salt from 25% to 81% on `Chen2020`, from 6% to 70% on `Ecker2015`, and from 18% to 81% on `OKane2022`. Halving it on `Ai2020` cut the share from 72% to 31%. On the designs both runs shared, every design whose status changed moved the way we predicted: 39 broke on `Ecker2015` at 2x and none recovered; 25 recovered on `Ai2020` at half current and none broke. So "SPMe is fine for this cell" is not a property of the cell. It holds at one current and can fail at the next.

**Our gate picked wrong on two of six conditions.** It skipped SPMe whenever 4 of the first 8 SPMe runs looked broken. On `OKane2022` and `Ecker2015` at 2x it skipped when running SPMe would have been cheaper. The reason is that a broken SPMe run fails in under a second, against about 27 s for a DFN run. A pool full of failures makes SPMe cheap, not expensive. The test is refuted as registered.

**Being wrong cost little.** The gated procedure never took more than 1.13 times the wall time of the better choice. Where the gate is unsure, the two choices cost about the same. After the verdicts we tried a gate that also uses the ratio of SPMe to DFN run time, which takes one extra DFN run. It chose right on 12 of 13 conditions, counting the seven earlier ones. That one is post hoc and needs its own test.

**The screen held; naming the winner did not.** At every condition the rule sent every design SPMe got wrong to DFN. Naming the winner reached the true best on five conditions. It missed by 3.2% on `Ai2020` at half current, on the same designs where the parallel run found it perfect at the usual current. There SPMe scores nearly every design about 24% too low, so a design checked with DFN always looks better than the unchecked ones, and the real best was never run. In the earlier step SPMe erred high and the opposite fix was needed. A bias in either direction breaks any comparison between checked and unchecked scores. We tried two more fixes after the verdicts. Comparing SPMe with SPMe works but checks the whole pool on four conditions. Correcting SPMe with a line fitted to the checked designs is worse, up to 14.6% short.

**What a battery engineer can take from it.** Re-check whether a reduced model can be trusted whenever the duty cycle changes, not just when the cell does. Running the rule by default is safe on cost: at worst it lost 13% to the better choice here. For naming the winner, keep checking with DFN while unchecked designs are within SPMe's usual error of the leader. That is the next pre-registered test.

Limits: one PyBaMM version, 64 designs per condition, current as the only condition changed, and run times from one 4-core machine. Code, numbers and the registered plan: [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).
