---
title: "A battery-model screen on cells it never saw: the screen held, the last step slipped"
seo_title: "Testing an SPMe trust rule for battery design search on new cells"
date: 2026-11-13
tags: [cell-fidelity, batteries, simulation, pybamm, multi-fidelity]
description: "A pre-registered test of when to trust PyBaMM's SPMe over DFN: all 9 mis-scored Chen2020 designs caught in 15 DFN runs; one pick 1.3% short."
---

The `cell-fidelity` programme asks when a lithium-ion electrode design search can rely on a cheap battery model, PyBaMM's SPMe, and when it has to pay for the full DFN model. Over the last two days we put together a rule from what SPMe's own run tells you:

1. If an SPMe run stops part-way, run it again once at tight solver tolerance. The [last step](2026-11-12-when-a-battery-model-fails-ask-the-solver-first.md) found that this fixes every early stop.
2. If it returns nothing, or still stops, treat the design as unknown and send it to DFN first.
3. Then run DFN on the rest in order of how low SPMe says the salt concentration got, most depleted first. Stop after three designs in a row where SPMe was close to DFN.
4. Report the design with the highest score, and confirm it with DFN.

That rule was built by looking at five PyBaMM cells, so its record on those cells shows only that it fits them. This step fixed the rule and four pass marks in the [research log](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/cell-fidelity/LOG.md) before any run. It then tried the rule on cells it had never seen, with fresh designs.

## Which cells

The plan named five candidate cells in order and took the first two whose baseline design ran under both models. The first, `Ramadass2004` (graphite and lithium cobalt oxide, a set PyBaMM itself calls a patchwork), fell out at once: SPMe can't run even its baseline design, and its DFN salt concentration falls to zero. Two more failed because our design mapping needs parameters their sets don't include. So the test ran on `Marquis2019` (a Kokam SLPB78205130H pouch) and `Chen2020` (the LG M50): 64 designs each, SPMe and DFN for 100 cycles, 256 runs in about 35 minutes on four cores.

## What held

On `Chen2020`, SPMe got 9 of 64 designs wrong. It returned nothing for 3 and under-scored 6 salt-starved ones by more than 25%. **The rule ran DFN on 15 designs, and those 15 included all 9.** The most useful catch was a design SPMe got wrong by less than the 25% threshold. The best design under DFN (164.6 Wh/kg) is salt-depleted, and SPMe scores it 23% low and ranks it 16th of 64. Every one of SPMe's top five sits at least 6% below it. A shortlist of SPMe's favourites would have missed the best design. Ordering by salt depletion went straight to it.

`Marquis2019` is a cell where SPMe is simply good: median error 0.4%, worst 5.6%, no design wrong by 25%. The rule spent 4 DFN runs and stopped. Both cells stayed within the cost limit set in advance.

## What slipped

The rule's last step chose a design on `Marquis2019` that is 1.3% below the best. That was between the 1% pass mark and the 2% fail mark, so we record it as mixed.

The screen wasn't at fault. SPMe ranks the true best design first, and the rule had already run it under DFN (199.5 Wh/kg). But step 4 compares that DFN score with SPMe scores for designs it hasn't checked. Across all 64 designs SPMe is very close to DFN, but its ten best designs score 1 to 6% above their DFN scores. An unchecked design's SPMe score (201.4) beat the checked best, and the rule confirmed that design instead.

The fix is obvious once you see it. We chose it after the results, so it is not a confirmed result yet: report the best design DFN has actually scored. On both new cells, and on four of the five cells the rule was built on, that gives the DFN best at no extra cost. The other choice is to keep checking the leader until it is a design DFN has scored. That gives the best on all seven cells, for up to two extra runs.

## Where it doesn't pay

On the two salt-limited cells from earlier steps (`Ai2020`, `NCA_Kim2011`), SPMe gets 81 to 89% of designs wrong. The rule still finds every one, but by then running SPMe first has cost more than running DFN on all of them (105 to 110% of the all-DFN time). A practical tool should notice this from the SPMe runs and switch to DFN. That is a next step, as is a fresh-data test of the re-solve step: neither new cell had an SPMe run that stopped early.

Everything here is from PyBaMM simulations, not built cells. Code, data and the full write-up are in [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).
