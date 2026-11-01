---
title: "The industries everything else runs on, and where open research can make them work better"
seo_title: "The industries everything else runs on, and open research"
date: 2026-10-21
description: "Why energy and the grid come first, what our open energy models found, and twelve applied research problems from water and freight to cement and payments."
tags: [infrastructure, energy, electric-grid, water, logistics, manufacturing, applied-research, open-source]
---

# The industries everything else runs on, and where open research can make them work better

This repository is built by AI coding agents, with one person, the owner,
steering. On 2026-10-21 the owner asked a simple question: which industries
are most fundamental to human survival and flourishing today? The follow-up
was a direction: build tools and applied research for those industries, and
look for ideas from other fields that make them more efficient, in small
steps or large ones.

This post gives our answer to the question and explains why energy comes
first. It sums up what the repository's open energy models have already
found, and lists the twelve problems a new research track is starting on.
The track is
[track 21 in `research/PROJECTS.md`](../../research/PROJECTS.md). None of it
is engineering, investment or financial advice.

A companion opinion piece,
[What AI agents depend on, and where they beat people](2026-10-21-what-ai-agents-depend-on-and-where-they-beat-people.md),
asks the same question from an AI agent's side.

## What depends on what

One way to rank industries is by how fast things fail when one stops.

- **Within days:** water and sanitation, food (and the fertiliser behind it),
  healthcare, and heat or cooling in a heat wave or a freeze.
- **Underneath all of those:** energy and the electric grid, mining, and basic
  materials such as cement, steel, plastics and ammonia.
- **Moving things and information:** freight by sea, rail and road;
  telecommunications; and the semiconductors that control everything above.
- **Coordination:** payments and finance, manufacturing and machine tools
  (the machines that make the machines), and waste management. Nobody notices
  waste management until it stops.

A few numbers show how deep these dependencies go. Erisman and colleagues
estimated in *Nature Geoscience* (2008) that nitrogen fertiliser from the
Haber-Bosch process sustained 48% of the world's population by 2008. UNCTAD's
*Review of Maritime Transport* puts the share of world goods trade that moves
by sea at around 80% by volume. And each of these industries runs on energy:
pumping water, grinding ore, firing cement kilns, moving freight, running
fabs.

## Why energy comes first

If you could make only one input cheaper and more reliable, energy is the one
that lowers the cost of every other industry on the list. The grid has become
the bottleneck. In *Electricity Grids and Secure Energy Transitions* (2023),
the IEA counted about 3,000 GW of renewable projects waiting in grid
connection queues worldwide, about five times the solar and wind capacity
added in 2022. The equipment is short too. A draft 2024 report from the US
National Infrastructure Advisory Council cites Wood Mackenzie lead times for
large power transformers of 80 to 210 weeks.

So the new track puts grid and energy problems first. It sits beside
[track 16](../../research/PROJECTS.md), which has spent three days on energy
storage and supply. Track 16 has no post yet, so here is what it found. Every
figure below is copied from the project's README. Most of these results rest
on assumed costs and synthetic weather, and each README says which.

- **Physics sets the ceiling.**
  [`energy-density`](../../research/energy-density/) reproduces five
  published theoretical energy densities to within 0.3%. It also shows that
  no battery chemistry it covers releases more than 1.65 eV per reactant
  atom. That is why denser chemistries need light elements.
  [`energy-practical`](../../research/energy-practical/) finds that real
  battery cells reach a fifth to two thirds of that ceiling. A 700-bar
  hydrogen tank system is only 5.1% hydrogen by mass.
- **Which storage is cheapest depends on how long it has to store.** In
  [`energy-lcos-mc`](../../research/energy-lcos-mc/), every cost is drawn
  from an assumed range rather than a sourced figure. Lithium-ion is cheapest
  in 96% of scenarios at 2 hours of storage but only 18% at 8 hours. Between
  6 and 12 hours, no technology wins more than 48% of scenarios. "The"
  cheapest storage depends on the duration.
- **The last few percent of decarbonisation cost the most.**
  [`energy-mix`](../../research/energy-mix/) models a whole power system on
  assumed costs and one year of weather. Serving 2019 demand from gas alone
  costs $79/MWh. The first 50% cut in emissions costs an implied $30 per
  tonne of CO<sub>2</sub>, but the last 5% costs $1,765 per tonne. At zero
  emissions, the price of hydrogen storage drives the result.
- **A smart controller is only as good as its forecast.**
  [`energy-tou-lp`](../../research/energy-tou-lp/) and
  [`energy-tou-lp-forecast`](../../research/energy-tou-lp-forecast/) test a
  10 kWh home battery on an assumed time-of-use tariff. With a perfect
  forecast, an optimal controller saves $892 a year, against $694 for a fixed
  rule. When the forecast is just yesterday's weather, 84% to 101% of that
  advantage disappears. This lesson comes back again and again below: a
  fancier optimiser is worth roughly as much as the forecast it is fed.
- **House-scale seasonal heat storage loses most of its heat.**
  [`energy-thermal`](../../research/energy-thermal/) sizes a sand store that
  still holds 10 MWh after 120 days. It needs 222 m<sup>3</sup> and returns
  26% of the electricity put in. At house size that makes it a store for days,
  not seasons. At district scale it does much better.

There are also two small tools people can use today: a
[demand-charge interval analyzer](../../ventures/demand-charge-interval-analyzer/)
that shows a business what its worst 15 minutes of electricity use cost, and
the [`energy-home`](../../research/energy-home/) solar-and-battery sizing
model.

## Where ideas from other fields could help

The track does not try to invent a new kiln or a new transformer. Its bet is
that methods already proven elsewhere are underused in these industries. Those
methods are optimisation, statistics, simulation, machine learning, robotics
and this repository's own research tools. Each project takes one costly,
measurable problem and reproduces the standard method on an open benchmark.
Then it asks whether a borrowed method does better at the same computing
budget. A small, checked gain on a real benchmark counts for more than a large
one on a toy problem.

The twelve starting problems, grid and energy first:

1. **How much solar and EV charging can a neighbourhood feeder take?** A
   feeder is the local distribution line serving a neighbourhood. The project
   measures hosting capacity, the most PV and charging it can take before
   voltage or thermal limits bind, on the IEEE test feeders in EPRI's
   open-source OpenDSS. Then it tests how much cheap measures add: inverter
   settings, smart charging and a tap change.
2. **When do heat pumps and EVs wear out the local transformer?** The project
   uses the IEEE C57.91 insulation-ageing model on hourly load, and asks how
   much of that ageing a charging schedule can buy back. With lead times of
   80 to 210 weeks for large transformers, delaying a replacement is worth a
   lot.
3. **Finding water leaks from pressure data.** Liemberger and Wyatt estimate
   that utilities lose about 126 billion cubic metres of water a year, as
   reported in secondary coverage of their study. The BattLeDIM 2020
   competition published a simulated city network with a known schedule of
   leaks. Our [changepoint detector](../../ventures/changepoint-detector/) is
   a method from statistics with no history in water networks. It will be
   tested on that benchmark against the competition's best entries.
4. **Energy per tonne-kilometre, from first principles, for trucks, trains,
   ships and aircraft.** The project combines this with the storage ceilings
   above to ask which transport modes can run directly on batteries, and
   which need a fuel such as hydrogen, ammonia or wind assistance.
5. **Routing electric delivery fleets.** The test is published benchmark
   instances with charging stations and a time-of-use tariff. Solvers and an
   AI proposer are scored against the best-known published solutions.
6. **Cement with less clinker.** Clinker is the kiln-fired ingredient
   responsible for most of cement's emissions, and Chatham House's 2018
   report put cement at about 8% of global CO<sub>2</sub>. The project works
   out the mass and energy balance for blends such as limestone calcined clay
   cement, with every emission factor sourced.
7. **Grinding ore with less energy.** The project builds a ball-mill and
   classifier circuit model and checks it against Bond's law, the long-used
   rule of thumb for grinding energy.
8. **Faster milling without chatter.** Chatter is the vibration that limits
   how fast a machine tool can cut. The project checks the Altintas-Budak
   stability solution against simulation, then picks the spindle speeds that
   remove the most metal.
9. **Cost per good chip.** The project compares yield models by die area and
   defect density, and finds where splitting a large die into chiplets pays.
   Three other tracks in this repository already cover chip design.
10. **Robotic waste sorting.** A detector is trained on an open recycling
    dataset, then a simulated conveyor pick cell is scored on purity,
    recovery and picks per minute.
11. **Liquidity in payment systems.** The project simulates a day of interbank
    payments and measures how much cash offsetting algorithms save and how
    much delay they cost.
12. **Heating and cooling control.** The project fits a building model to open
    data and tests a predictive controller against a thermostat rule. The
    forecast is deliberately imperfect, because the battery result above
    showed that matters.

Some of these will be small improvements. A few, like extra feeder capacity
from inverter settings alone, could be worth a lot if the numbers hold up on
real networks. We will report whichever it turns out to be.

## What this work will not do

These are research models, not plants. The track's guardrails say:

- **No real operational systems.** The work never touches, scans or probes a
  utility, water, payment or factory control system. It uses public datasets
  and simulators only.
- **Licensed sign-off.** Anything involving drinking water, grid protection,
  pressure or structures needs licensed engineers and the operator's approval
  before real-world use.
- **Honest numbers.** Every price, emission factor and device figure is
  sourced and dated, or swept across a range, and modelled results are never
  presented as measured ones.

## Caveats

The external figures above come from the publications named. For the IEA
queue, the transformer lead times and the water-loss estimate, this run read
secondary coverage rather than the primary report, and says so. The energy
results are from this repository's models and are mostly built on assumed
inputs, as each README states. The twelve projects are plans, not results.
Any future post on them will report what they found, including findings that
the borrowed method did not help.

## Update: the first grid result

The first project in the energy-and-grid list is done: how fast heat pumps and
electric cars wear out a neighbourhood transformer. In a model of ten homes on
a transformer sized with ordinary headroom, nothing much happens until about
half the homes have both a heat pump and a car. After that the wear climbs
steeply, to about 5.6 % of the insulation's life per year with everyone
plugging in on arrival, against about 1 % if cars charge in the low-load hours
overnight. Smart charging fully fixes the cars but not a cold snap, when every
heat pump runs at once. The transformer constants are swept, not verified
against the paywalled standard, and the heat pumps are fully coincident, so
read the 100 % figures as a pessimistic bound. Code, data and tests:
[`research/infra-transformer`](../../research/infra-transformer/README.md).
