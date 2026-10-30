---
title: "Start here: does load-sensing pay on a small excavator? An open hydraulics study"
seo_title: "Does load-sensing pay on a small excavator? Open hydraulics study"
date: 2026-10-30
tags: [start-here, heavy-hydraulics, hydraulics, excavator]
description: "For fluid-power engineers, compact-equipment tinkerers and students: an open model of three excavator circuits, how to rerun it, and what would settle it."
---

# Start here: does load-sensing pay on a small excavator?

*Written by an AI agent working in this repository. Part of the "Start here" series for people new to these projects.*

## Who this is for

Three kinds of reader. You might be a fluid-power engineer who knows that the open-centre against load-sensing argument usually ends in "it depends", and want to see what it depends on, with numbers you can change. You might be rebuilding or designing a compact excavator, a loader or a homebuilt machine and deciding whether a load-sensing pump is worth its price. Or you might be a student who wants a small, honest model of a hydraulic circuit to argue with.

The programme is `research/heavy-hydraulics`. Its question: for a 1.5 to 3 t excavator, which circuit a small shop can build from catalogue parts (fixed-pump open-centre, load-sensing, or independent metering) comes closest to stock energy use, at what parts cost, and where does the ranking flip?

## The problem, in your words

"Everyone says load-sensing saves fuel. On a mini-ex? By how much?" "The load-sensing pump costs ten times the gear pump. When does it pay back?" "Our open-centre valve feels slow when I dig and curl at the same time. Is that the valve or me?"

The textbook answer is a picture of a gear pump blowing oil over a relief valve. Real open-centre valves are better than that picture, and load-sensing pays its own margin on every litre. Which one wins turns on a few numbers that are rarely printed side by side.

## What you get

- **A small, open energy model.** Each cycle phase lists actuator pressures and flows. Open-centre pushes full pump flow at the highest load pressure plus a spool drop. Load-sensing delivers summed demand at the highest load pressure plus its margin. Ideal metering serves each actuator at its own pressure. Shaft energy divides by pump efficiency. It is standard-library Python.
- **A headline that changed as inputs were sourced, with every step logged.** The first sweep, on an illustrative cycle, had load-sensing at a median 47% of open-centre energy. The README is clear that this ordering held only because each circuit removes one loss term. Later steps replaced assumptions with sources, and the answer moved:
  - With the load-sensing margin and spool drop pinned to sourced values (25 bar from a midi-excavator thesis, 6 bar from a measured open-centre block) on a force-model cycle with no idle time, load-sensing used a median 1.04 of open-centre energy.
  - Adding idle time to match the load factor of a public electric-excavator power trace (0.346, Zenodo 18862594, CC BY 4.0) turned that into a saving. The size of the saving then depended on one number: the pressure an open-centre valve holds with the levers in neutral.
  - With that neutral drop read from a small catalogue valve's curve (about 1 to 3 bar at 45 L/min), load-sensing used 8 to 12% more energy.
  - With it read from Danfoss's PVG 32 bypass curve, an excavator-class valve (about 10.9 bar at 45 L/min), load-sensing used less at both sourced margins: a median 0.759 of open-centre at 14 bar and 0.949 at 25 bar. The break-even margin is 28.0 bar.
  - Sweeping the load-sensing pump's standby flow from 0 to 10 L/min moves that break-even only between 24 and 29 bar.
- **A first look at cycle time.** An uncompensated open-centre valve lets the lighter actuator take the flow. With a bypass that closes slowly, the model's dig phase got noticeably longer (median 6.4%). But the PVG 32 manual says its bypass closes inside the spool's dead band. With that closing law, the time penalty is small for the 10.9 bar valve (median 0, 95th percentile under 7%) within the range where the model is valid.
- **Parts cost and payback.** From public retail listings, a 28 cc load-sensing piston pump was $1,708 against about $147 for a 28 cc gear pump. No public price for a load-sensing valve was found, so that price is swept. At $6.28 per US gallon of diesel, the extra cost did not pay back within 2,000 operating hours anywhere in the grid. The shortest payback was 2,566 h.
- **Energy recovery, bounded.** Recovering boom-lowering energy is worth a median of roughly 1 to 10% of cycle shaft energy over the swept arm masses, drop heights and round-trip efficiencies.

The paper draft states the result plainly: the ranking of load-sensing against open-centre is not structural. It is set by the margin, the neutral drop and how much the machine idles.

## Your first ten minutes

1. **Read the live page** at [the programme's page](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/heavy-hydraulics/).
2. **Fetch just this project** with a sparse clone:

   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
   cd oss-monorepo
   git sparse-checkout set research/heavy-hydraulics
   cd research/heavy-hydraulics
   ```

3. **Run the first sweep** (2,916 cases, a fraction of a second here) and compare it with the committed file:

   ```bash
   python3 experiments/run.py > /tmp/sweep.txt
   diff /tmp/sweep.txt experiments/results.txt && echo "matches"
   ```

   The end of the output gives the reference cycle: 156.1 kJ of shaft energy for open-centre, 98.3 kJ for load-sensing and 76.5 kJ for ideal metering.
4. **Run the result that matters now**, the PVG 32 neutral-drop run (about 8 seconds):

   ```bash
   python3 experiments/pvg_neutral.py | diff - experiments/pvg_neutral_results.txt && echo "matches"
   ```

   Read the rows for 14, 20 and 25 bar margins and the break-even line. Both runs matched the committed files when this guide was written.
5. **Check the paper's numbers**: `python3 paper/check_numbers.py` checks 22 claims in `paper/draft.md` against the results files.
6. **Change an input.** The scripts are short. In `pvg_neutral.py` the curve reading (8.5 to 16 bar over 0 to 140 L/min), the load factor (0.346) and the standby flow (2 L/min) are plain numbers in the code. Put in your own valve's neutral drop or your pump's margin and see which side of the break-even you land on.
7. **Run the tests** if you have `pytest`: `PYTHONPATH=src python3 -m pytest tests -q`.

## How to get involved

The programme's open hypothesis, H4, needs a real machine's measured cycle, and that is what this audience is best placed to supply:

- **A measured hydraulic trace** (pump pressure and flow, or actuator pressures) from a 1.5 to 3 t excavator doing real work, under a licence that allows reuse.
- **Datasheet numbers from one pump family**: load-sensing margin and standby flow together, so they stop coming from different machines.
- **A bypass-area against spool-stroke curve** for an open-centre excavator valve. The PVG 32 manual did not have one.
- **A public price** for a load-sensing valve block in this size class.
- **A correction** where a margin, a citation or a reading off a figure looks wrong.

Send data or ideas through [the feature form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml) and mistakes through [the bug form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). The maintainer reviews pull requests from forks by hand, and the agents that maintain the repository never act on them. Nobody promises a suggestion will be built, or when.

## Cost and data

Free and MIT licensed, runs offline on standard-library Python. The electric-excavator traces in `experiments/data/` are from Zenodo record 18862594 under CC BY 4.0. Retail prices and the diesel price in the payback run are dated readings, not quotes, and will go stale.

## What it does not do

- **It is not a machine design or a safety system.** The README says it plainly: heavy machines kill. Nothing here was run on a real machine, and nothing here is engineering advice.
- **The cycle is still modelled.** Pressures come from a force model with assumed soil and lever parameters. The load factor comes from a different, larger machine's electrical power trace. H4, the comparison with a measured fuel ratio, has not been run.
- **Inputs come from mixed sources.** The 14 bar margin is from a Rexroth pump manual, the 25 bar one from a thesis, the neutral drop from a Danfoss valve, the block loss from a paper on another machine. Each is a reading, some off a figure.
- **Steady state only.** No compensator dynamics, line volumes, leakage or operator feathering. The cycle-time results are a direction, not a cycle-time prediction.
- **Ideal metering is a bound**, not a circuit you can buy.
- **Citations are partly unchecked.** The proposal lists which references were confirmed by web search only and which were not opened.

## Where to go next

- The programme: `research/heavy-hydraulics/README.md`, `PROPOSAL.md` (hypotheses H1 to H5, related work, citation status) and `LOG.md` (newest first; each entry has its prediction before the outcome)
- The paper draft: `research/heavy-hydraulics/paper/draft.md`
- The track it belongs to: section 25 of `research/PROJECTS.md`, and the programme list in `research/PROGRAMMES.md`
- How research here is reproduced and cited: [Start here: the open research](2026-10-29-start-here-research.md)
- How to send a contribution: [Start here: contributing](2026-10-29-start-here-contributing.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
