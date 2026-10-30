---
title: "How close can a RepRap shop get to self-replication? Findings from 40 studies"
seo_title: "How close can a RepRap shop get to self-replication?"
date: 2026-10-20
description: "Closure of a RepRap Prusa Mendel, doubling time against import budget, when to stop copying and the materials balance: 40 self-replication studies."
tags: [research, self-replication, reprap, 3d-printing, manufacturing]
---

# How close can a RepRap shop get to self-replication?

One research track in this repository asks an old question in a down-to-earth
form: can a small set of machines make copies of itself, and useful goods
along the way, while importing as little as possible? The brief in
[`research/PROJECTS.md`](../../research/PROJECTS.md) defines two terms used
below. *Closure* is the share of a machine's parts, by count, mass or cost,
that the shop can make itself. *Vitamins* are the parts it cannot make, such
as motors, electronics, bearings and fasteners, which is the RepRap project's
word.

There are 40 `research/selfrep-*` projects (`ls -d research/selfrep-*`). Five
are the track's milestones (closure, next machine, growth, reinvestment,
materials); most of the rest test one assumption of an earlier one. AI coding
agents did the work, with the repository's owner steering. Every number below
is copied from the README linked next to it.

The main caveat is large. The parts list is real, re-keyed from the RepRap
wiki's Prusa Mendel (iteration 2) page, but the part masses, costs, machine
prices, print rates and failure rates are assumed placeholders, not weighed
or quoted. The READMEs say the shapes of the results are the findings and the
absolute hours and kilograms are illustrations. This is not engineering or
business advice.

## 1. A printer alone makes about a sixth of its own mass

[`research/selfrep-closure/`](../../research/selfrep-closure/) modelled the
Prusa Mendel as 51 part lines, 18 of them printed, and computed closure for
three growing seed shops.

| Shop | Part lines | Mass | Cost |
|---|---|---|---|
| Printer alone | 35.3% | 17% | 11% |
| + CNC router + laser cutter | 43.1% | 22% | 16% |
| + metal casting, brass bushings | 45.1% | 24% | 21% |

Mass and cost closure stay below 25% and 21% even for the largest shop. The
vitamins that dominate are the motors, electronics, rods, bearings and
fasteners. Which process can make which part is the agent's own judgement,
marked part by part in the code.

[`research/selfrep-judgement/`](../../research/selfrep-judgement/) tested
that judgement. Buying every disputed line instead of making it takes mass
closure to 17.3%, the same as the printer alone. By contrast, making the five
NEMA17 motors in-house would add 22 points of mass closure and 26 of cost.
The open question is rods, motors and electronics, not washers.

## 2. Redesigning parts helps cost closure much more than mass

[`research/selfrep-redesign/`](../../research/selfrep-redesign/) searched over
part substitutions such as printed idlers, printed nuts and wooden rods.
Applying all seven took vitamin lines from 29 to 19 and closure to 60.4% of
lines, 35.8% of mass and 47.7% of cost. Mass closure stays below 36% under
every set, because motors, electronics, threaded rods and the hot end remain
vitamins.

[`research/selfrep-rodbeam/`](../../research/selfrep-rodbeam/) checked the
wooden rod. Under the same load, a 420 mm rod of 8 mm diameter deflects
0.19 mm in steel and 3.8 mm in hardwood (20 times as much), so matching steel's stiffness needs
about 16.9 mm of hardwood, outside the 8 mm bearings the printer is built
around. It also found that the closure metric rewards heavier, worse rods,
because dowel stock counts as makeable while a steel rod does not. That is a
flaw in the metric, stated in the README.

## 3. A simple greedy rule usually picks the right next machine

[`research/selfrep-nextmachine/`](../../research/selfrep-nextmachine/)
compared a greedy rule (buy the machine with the best closure gain per price)
with exhaustive search. On the real three-machine instance they always
agreed. On 500 random synthetic instances, greedy matched the optimum in 72%
to 94% of cases depending on budget, but its worst case got 0.619 of the
optimal gain, when processes are complements or the budget is tight.

## 4. Growth is limited by the import budget until machine time takes over

[`research/selfrep-growth/`](../../research/selfrep-growth/) simulated a fleet
of printers building copies of themselves from printed parts plus bought
vitamins. With a small import budget the doubling time falls almost in
proportion to the budget: 7,162 hours at 0.25 currency units an hour, 455 at
4, 120 at 16. Beyond about 64 an hour, machine time limits and the doubling
time flattens at about 53 hours. At a budget of 4 an hour, raising cost
closure from 11% to 90% cut the doubling time from 457 to 59 hours, an upper
bound because the extra machine time per copy is held fixed.

[`research/selfrep-wearout/`](../../research/selfrep-wearout/) added machine
lifetimes. With mean lifetimes of 40 to 200 hours, every run died out, even
where a smooth fluid model predicts a fleet of 1.3 to 4.7 machines. Small
populations go extinct by chance. At 500 hours, 20% of runs died out.

## 5. Copy flat out, then stop one e-folding time before the end

[`research/selfrep-reinvest/`](../../research/selfrep-reinvest/) asked when a
fleet should stop copying itself and start making goods, over a 600-hour
horizon with a fleet worth nothing at the end. The best switch came at 549
hours, against 550 from the closed form: stop one e-folding time of the fleet
(50 hours here) before the horizon. The best constant split between copying
and goods captured only 9% of that value with no failures. Smooth policies
matched the sharp switch but did not beat it. The README notes the sharp
answer comes from linear dynamics and unlimited demand; a saturating market
would smooth it.

## 6. Recycling the shop's own scrap barely matters; vitamins dominate

[`research/selfrep-materials/`](../../research/selfrep-materials/) built a
mass and energy balance for one more printer. For the printer-alone shop,
5.26 kg of the 6.48 kg imported per copy are vitamins, about 82%. Recycling
the shop's own scrap cut total imported mass by a median 3%, because
production scrap is only about 0.1 kg of plastic per copy. Recycling plastic
from retired machines would matter more: virgin filament falls from 1.12 kg
to 0.86 kg, or to 0.24 kg if a larger recycled share were acceptable, which is
the least certain input. Energy is about 9 to 10 kWh per copy, almost all of
it printing.

## What it adds up to

Under these assumptions no seed shop approaches full closure, and the
self-replication bottleneck is the familiar one: motors, electronics and
precision rods. The useful outputs are the structure of the problem and a
set of small, testable models. The owner steps listed in the READMEs are to
weigh real parts, get dated quotes, and measure print throughput and failure
rates, then rerun the models. One named comparison, with Lackner and Wendt's
1995 growth model, was not made, because the agent did not have the paper's
text and would not describe it from memory.

Companion roundups cover
[robot assembly in simulation](2026-10-20-robot-assembly-simulation-digital-twin-findings.md),
which includes a gripper that builds its own next generation, and the
[ambient AI assistant track](2026-10-20-ambient-ai-assistant-when-to-speak-research.md).
