---
title: "Open-source chip design loops on Yosys, OpenROAD and SKY130: what 57 small experiments found"
seo_title: "Open-source chip design loops on Yosys, OpenROAD and SKY130"
date: 2026-10-20
description: "What 57 small experiments on open EDA tools found about synthesis scripts, design search, cheap estimates and verification, with the limits of tiny designs."
tags: [research, chip-design, eda, yosys, openroad, open-source]
---

# Open-source chip design loops on Yosys, OpenROAD and SKY130: what 57 small experiments found

Can a chip-design loop run unattended on open tools? A spec goes in. Checked
RTL and a set of power, performance and area (PPA) trade-offs come out. Two
research tracks in this repository work on that question. Track 3 (`chip-*`,
35 projects) asks what an LLM adds to the loop. Track 7 (`eda-*`, 22 projects)
builds the loop with no LLM: search algorithms propose designs and flow
settings, and open tools score them. Both briefs are in
[`research/PROJECTS.md`](../../research/PROJECTS.md), sections 3 and 7.

The tools are Yosys and ABC for synthesis, Icarus Verilog and Verilator for
simulation, SAT-based equivalence checks, and OpenROAD on the SkyWater SKY130
open PDK for place and route. The toolchain project
[`chip-toolchain`](../../research/chip-toolchain/) records the versions: Yosys
0.33, Icarus Verilog 12.0, Verilator 5.020.

This post covers both tracks at once. For the chip track alone in more depth,
see [What 35 open chip-design experiments found about Yosys and ABC](2026-10-20-chip-design-loops-what-35-open-experiments-found.md).

**Who did this.** AI coding agents (Claude) did the work, in unattended
scheduled sessions, with the repository's owner steering. That matters for one
result in particular: wherever a README says "proposer" or "LLM", the
proposals were written by the Claude session that built the project. They did
not come from a separate API call, and they are not a reproducible model
benchmark. [`chip-rtl-loop`](../../research/chip-rtl-loop/) says so in bold.

## Read this first

The designs are tiny: adders, multipliers, FIFOs, a MAC engine for a toy
quantised MLP. Most numbers are cell counts and logic depth from one synthesis
script, or SKY130 estimates from an open flow. The track's own guardrail says
these are not sign-off results and say nothing measured about silicon.
Nothing has been taped out.

## 1. Synthesis-only numbers are a rough guide to layout

[`chip-pnr`](../../research/chip-pnr/) placed and routed ten small designs on
SKY130 and compared them with synthesis-only estimates.

- Final area over mapped area ran from 1.000 to 1.275. Most of the growth came
  where timing had to be repaired: 9% to 28% for the 16- and 32-bit adders. The
  combinational designs that already met timing kept their mapped area; the
  FIFOs grew 4% to 6% for clock-tree buffers.
- Before repair, wires lengthened the implied clock period by 3% to 19%.
  Longer and wider logic suffered more.
- Generic gate count is a poor proxy for library area across kinds of logic:
  5.1 to 5.8 µm² per gate for combinational designs, about 17.2 for FIFOs,
  because a flip-flop is large.

[`chip-ppa-sky130mac`](../../research/chip-ppa-sky130mac/) shows the cost of
trusting the cheap metric. Over the MAC rewrites, generic cells × depth ranked
designs against SKY130 area × delay with a Spearman correlation of only 0.20.
The candidate with the best generic score came out 10% worse than the best
mapped design.

## 2. The synthesis tool leaves gates on the table, and its output depends on wording

- [`chip-exact4`](../../research/chip-exact4/) compared Yosys against proven
  minimum circuits for 884 four-input functions, covering all 222 NPN classes.
  The default flow hit the minimum on only 34% of them and averaged 1.19 gates
  above it. Taking the best of seven scripts per function raised that only to 38%.
- Yet [`chip-cutheadroom`](../../research/chip-cutheadroom/) found that
  rewriting small cones with their exact optimum would remove nothing. It found
  0 removable gates in 28 of 30 netlists. The tool's real gains, and its real
  losses, are not local.
- [`chip-abc-order`](../../research/chip-abc-order/) changed only the order of
  added operands in equivalent Verilog. That moved cells × depth by up to 1.43×
  within one structure and script. Renaming wires and shuffling statements never
  changed anything.
- [`chip-constmul`](../../research/chip-constmul/) wrote 255 fixed-weight
  multipliers as canonical-signed-digit shift-and-add. That cut total cells by
  33.0% against Yosys's own `x * K`, whose cell counts track the binary bit
  count (Pearson 0.972). Sharing sub-sums across a bank of multipliers
  ([`chip-mcm`](../../research/chip-mcm/)) saved about 20% more at bank sizes
  8 and 16.

## 3. Checks: simulation finds most bugs, formal proofs catch the rest at a price

In [`chip-rtl-loop`](../../research/chip-rtl-loop/), the session's own RTL
passed 6 of 9 tasks at the first attempt and 9 of 9 after one round of reading
the checker's mismatch trace. The tasks are textbook circuits and the proposer
wrote them, so the README calls these anecdotes.

The mutation studies are more informative.
[`chip-rtl-probe`](../../research/chip-rtl-probe/) injected 414 single-point
bugs. Of the 389 rejected, 30 (7.7%) had passed lint and 4,000 random test
vectors, and only the equivalence proof caught them.
[`eda-verify`](../../research/eda-verify/) priced the trade. Random simulation
killed 42 bugs per CPU-minute and the bounded formal check 0.31. Only the proof
can certify that a change is harmless, at about two hundred times the cost.

## 4. Search: good algorithms help a little; cheap estimates help a lot

[`eda-proposers`](../../research/eda-proposers/) compared six search methods at
equal evaluation budgets, over 100 seeds. At budget 30, TPE (a Bayesian
optimiser) found 0.980 of the true Pareto front's hypervolume, against 0.943 for
random search. Simulated annealing was behind random at every budget up to 30.
[`eda-noisy`](../../research/eda-noisy/) added noise to the objective. TPE's
lead shrank steadily and was gone at a noise level of 0.8, while NSGA-II lost
its lead at about 0.1.

The bigger savings came from not running the expensive tool:

- [`eda-fidelity`](../../research/eda-fidelity/) ranks designs with a cheap
  analytic model and simulation first, then synthesises only the survivors
  (successive halving). That found the optimum with certainty in 20 tool-seconds,
  against 205 s to synthesise all 40 designs. Random search with the same 20 s
  averaged 1.785 times the optimum.
- [`eda-surrogate`](../../research/eda-surrogate/) predicted Yosys cell counts
  from word-level RTL features with a 3.9% median error inside known design
  families. On a new family the error was 20% to 200%, but rank agreement held
  (Spearman 0.75 to 1.00). [`eda-screen`](../../research/eda-screen/) used such a
  screen to reach 0.990 of the front at 12 syntheses, against 0.860 for random
  search. Its own ablation credits part of that gap to objectives it gets for
  free.

## 5. Things that did not work

The READMEs report negative results plainly:

- **Recipe transfer.** In [`eda-flowtune`](../../research/eda-flowtune/), the
  best ABC pass sequence for one design scored on average 1.31 times the
  optimum on another. Only 2 of 56 pairs came within 5%.
- **Systolic arrays at this size.** For the toy MLP,
  [`chip-systolic`](../../research/chip-systolic/) found a simple MAC-lane
  engine beat the best systolic array by about 1.6× to 1.8× in cells × cycles.
  Scaling up in [`chip-systolic-p32`](../../research/chip-systolic-p32/) still
  left the MAC engine 23% to 30% ahead.
- **The agent's own proposals.** In
  [`chip-scriptsearch`](../../research/chip-scriptsearch/), 40 session-written
  ABC scripts did about as well as hill climbing at the same budget, 1.088
  times the optimum. They did not find the optimum. The landscape is a needle:
  only 0.1% of 800 points lie within 1% of the best.

## Update, 2026-10-22: a generic-gate screen finds the best mapped design in a few tries

Two follow-ups on the cell library question, both on the same 40 MAC-engine
designs (1 to 8 lanes, 4 to 8 bits). [`eda-sky130rung`](../../research/eda-sky130rung)
mapped them to the SKY130 HD library: generic cell count ranks mapped area
almost perfectly (Spearman 0.995) but logic depth ranks the mapped critical-path
delay at only 0.611. [`eda-latencyhalve`](../../research/eda-latencyhalve) then
asked whether that matters for a search loop, which only needs the best design
near the top of the cheap list. It does not, on this family: generic cells times
cycles ranks the best design (4 lanes, 4 bits) first for area times latency, and
over 5,000 random pools of 20 designs, mapping the top 3 finds the pool's best
97% of the time (random choice: 15%). Caveats: one design family, a synthesis
model rather than place and route as the truth, and intervals that cover only
the random draws.

## Caveats

- **Tiny designs, one tool version.** Results can move between Yosys releases.
  Several projects show the verdict flipping with the synthesis script.
- **No real LLM benchmark yet.** Track 3's "LLM" results come from one agent
  that also chose the tasks. A fair comparison needs an independent model run
  through track 7's harness, which is listed as a later milestone.
- **Follow-up chains.** Nine of the 35 `chip-*` projects are `chip-systolic*`
  variations. They firmed up a negative result rather than opening new ground.
- **Not sign-off.** Open-flow post-route numbers are estimates. None of this is
  professional engineering advice.

The next step both briefs name is an unattended run from a written spec to a
Tiny Tapeout-sized layout. Submitting a design is the owner's call.

For how the agent fleet behind this work runs, see
[Throughput per unit of supervision](2026-10-16-throughput-per-unit-of-supervision.md).

## Update, 2026-10-22: Spearman is not the screen's payoff

A search loop maps only a cheap screen's top few designs, yet the `eda-*`
projects score proxies by Spearman rank correlation with the mapped result.
[`eda-rankpayoff`](../../research/eda-rankpayoff) tests whether the two agree
on 207 screens of the 40 MAC engines. For mapped area × latency they do
loosely (Spearman 0.60 across screens against the chance the first mapping
finds the pool's best). For mapped latency alone they do not (−0.13): the
screen with the highest correlation (0.958) maps the best design first 32% of
the time, while gate count, at 0.551, does so 69%. One design family, 40
points and one winner, so treat it as a warning about the metric, not a rule.
