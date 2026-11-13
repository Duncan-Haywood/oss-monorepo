---
title: "We built a fix for the cheap battery model's bias. On fresh designs, the old method never needed it"
date: 2026-11-13
tags: [cell-fidelity, batteries, simulation, multi-fidelity, pybamm, pre-registration]
seo_title: "Best battery design when SPMe scores low: a pre-registered test"
description: A gap-aware stop always found the best battery design, but the simpler rule it was built to fix never missed on fresh designs. 788 PyBaMM runs.
---

The `cell-fidelity` programme asks when a lithium-ion electrode design search can trust PyBaMM's SPMe, a cheap reduced battery model, instead of the full DFN model. Our current method runs SPMe on every candidate design. It then checks the suspicious ones with DFN, and names a winner by checking whichever design leads until the leader is one DFN has confirmed.

In the last step that naming rule missed once. On the `Ai2020` cell at half current, SPMe scored almost every sound design about 24% too low. A design DFN had already checked always looked better than the unchecked ones, so the true best was never run. The answer came out 3.2% short.

**The fix.** Keep running DFN while any unchecked design could still win, once you allow for SPMe's typical error. We measure that error as the median ratio of DFN to SPMe on the checked designs that are not salt-depleted. If SPMe has been running 20% low, an unchecked score within 20% of the leader still gets a DFN run. We picked this "band stop" from four variants on the 13 conditions already simulated, where it found the true best every time. Those numbers can't count as evidence for it, so we wrote down five tests and ran 788 new simulations. They covered six combinations of cell and current, with 64 designs that no earlier run had used.

**The fix worked.** The band stop named the true DFN best on all six conditions. Its cost ran from a third of the wall time of running DFN on every design up to 1.07 times it.

**But it wasn't needed.** The old naming rule also found the true best on all six. That includes `Ai2020` at three-quarters current, where SPMe again scored sound designs about 24% low (median). We had predicted that the old rule's miss would come back on a condition like that. It didn't, so that test is refuted. On the two `Ai2020` pools the band stop spent 9 and 11 extra DFN runs and gained nothing.

**The count over everything run so far.** Over 19 conditions, the old rule misses once, by 3.2%. The band stop never misses, and it costs between 0 and 13 extra DFN runs per pool of 64 designs. That is up to a fifth more simulation time. Neither choice wins outright: it depends on whether a 3% worse design costs you more than a fifth more compute.

**Two things held again.** The screening half of the method sent at least 97% of the designs SPMe got wrong to DFN at every condition. It missed one design on `OKane2022` at 1.5 times current, which was not the winner. Current mattered more than the cell did. Halving the current left `Chen2020` and `Ecker2015` with no design SPMe got wrong at all. On `Ai2020`, the share of designs where SPMe fails or runs out of salt was 6%, 31%, 53% and 72% at a quarter, half, three-quarters and full current. Those four numbers come from four different sets of designs.

**What a battery engineer can take from it.** If missing the best design by a few percent is expensive, use the band stop. It never missed in 19 conditions, and at worst it cost 7% more than running DFN on everything. If compute is the tight budget, the simpler rule was right 18 times in 19. Either way, check SPMe's trustworthiness again whenever the current changes.

Limits: one PyBaMM version, 64 designs per condition, and current is the only thing we varied. Thirteen DFN runs on `Ai2020` at a quarter current failed in their first cycle and were dropped, as the plan said they would be. Code, numbers and the registered plan: [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).
