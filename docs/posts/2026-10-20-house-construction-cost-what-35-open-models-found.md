---
title: "What 35 open models of house construction cost found"
date: 2026-10-20
description: "Framing, energy, foundations, schedules and factory shells: what 35 open-source house-building models found about cost, and how far to trust them."
tags: [research, housing, construction, open-source, energy]
---

# What 35 open models of house construction cost found

Most of the engineering behind a new house lives in copyrighted tables, paid
software and contractors' heads. Span tables, energy models, framing layouts
and cost estimates are hard to inspect and harder to change.

This repository has a research track that tries to do that work as open,
testable code. It asks two questions: which design and process choices cut the
cost of a house most per square foot without losing strength, comfort or
energy performance, and how much of a house can be written as parametric code
that anyone can change, check and build from. The track's brief is in
[`research/PROJECTS.md`](../../research/PROJECTS.md), section 12.

In about four days it produced 35 small projects, each a directory under
`research/house-*` with its code, its experiments and a README. They range
from joist spans and roof trusses to foundations, energy envelopes, build
schedules and Denver's water tap fee. One of them,
[`house-open-design`](../../research/house-open-design/), puts the pieces
together into a worked example: a 24 x 20 ft backyard cottage that needs 2,614
board feet of framing (5.45 bf/sq ft).

**Who did this.** The research was done by AI coding agents (Claude), working
unattended in scheduled sessions, with the repository's owner setting the
direction and the guardrails. No licensed engineer or architect has reviewed
any of it. Keep that in mind for everything below.

## Read this first: what these models are

Nearly every headline in these READMEs carries the word "stylised", and they
mean it. The common limits:

- **Prices are mostly assumptions.** Many projects say outright that their
  unit prices are "invented round numbers" or "from memory", not sourced.
  Treat the dollar figures as illustrations of a method, not quotes.
- **Simple physics.** The energy work uses steady-state degree-day loads, not
  an hourly simulation like EnergyPlus. The schedule models are uncalibrated
  Monte Carlo and discrete-event models.
- **No code checks.** Every project says its design needs a licensed
  architect's or engineer's review, or the local code's prescriptive path, and
  a permit, before anyone builds from it.

What the projects can show is the *shape* of a trade-off: which lever is big,
which is small, and which assumption a result hangs on. Several follow-ups
exist only to test an earlier project's weak spot.

Nothing here is financial, legal or engineering advice.

## 1. Advanced framing saves a lot of lumber, but lumber is a small part of the price

[`house-framing`](../../research/house-framing/) compared conventional and
"advanced" (optimum value engineering) framing of a house's exterior walls.
Advanced 2x6 framing at 24 in used **42% less exterior-wall lumber than
conventional 2x6**, and 16% less than conventional 2x4, while insulating 40%
better than the 2x4 wall. Its pieces fell from 210 to 154.

The README is candid about why the number is large: its conventional baseline
is generous (2x12 headers everywhere, 4-stud corners, 3-stud tees), and a
leaner baseline would show less. At assumed prices of $0.60 to $1.20 per board
foot, the lumber saving is **$450 to $900 per house**.

That is small next to the whole price. Using NAHB's 2024 survey,
[`house-market`](../../research/house-market/) reports that construction is
64.4% of an average new US home's price, and framing is 16.6% of construction,
behind interior finishes (24.1%) and mechanical rough-ins (19.2%). A 20%
saving on framing alone moves the price 2.1%.

Two follow-ups push the point further. In
[`house-cost`](../../research/house-cost/), a 14% cut in framing lumber is
worth only 0.85% of the price. And
[`house-sobol`](../../research/house-sobol/), which treats every uncertain
input as random at once, finds that **floor area alone explains 53% of the
price index's variance and storeys 19%**, while the framing inputs together
explain under 1%.

## 2. The cheaper wall is also the better wall

[`house-energy`](../../research/house-energy/) searched for the envelope
(walls, attic, windows, air sealing, slab edge) with the lowest cost of
building plus 30 years of energy, in eight climates. In every climate it took
the advanced 2x6 wall, which costs **$42 less to build** than a conventional
2x4 wall in this model and loses 40% less heat through the opaque wall. That
switch is most of a **13 to 15% lower 30-year net present cost** than the
baseline, $2,100 to $4,600 per house.

Better windows and R-49 attics did not pay at the assumed prices, with
simple paybacks of 23 to 190 years.

Here is the caveat the README puts in bold: **the optimum picks windows worse
than a typical code floor (U 0.50)**, because the model counts only conduction
and ignores solar gain, comfort and condensation. Two follow-ups tested that.
[`house-solar`](../../research/house-solar/) added solar gain, and U 0.50 still
stayed the cost-optimum in 15 of 16 climate and system cases. It also found
that orientation is free and worth **$420 to $1,740 of 30-year net present
cost** per house. [`house-energyprices`](../../research/house-energyprices/)
swapped in published regional energy prices, and the optimal package was
identical to `house-energy`'s in 10 of 12 cases.

None of this says a U 0.50 window is allowed or wise.

## 3. In cold places, a frost-protected shallow foundation wins

[`house-foundation`](../../research/house-foundation/) compared a slab,
crawlspace, basement and frost-protected shallow foundation (FPSF) for a small
house. From a frost depth of about 18 in down to 60 in, the FPSF was cheapest
in **100% of 5,000 random price draws**, because its footing stays 16 in deep
while the others follow the frost line down.

At 48 in of frost the midpoint first costs were:

| Foundation | Midpoint first cost |
|---|---|
| Frost-protected shallow foundation | $13,200 |
| Conventional slab | $20,600 |
| Crawlspace | $24,100 |
| Basement | $54,900 |

The README warns that every price is from memory with no region specified,
and that the FPSF result leans on an invented rule for its insulation wings
and ignores conditions the FPSF standard (ASCE 32-01) requires. A basement
also gives space the others lack, which the comparison does not value.

## 4. A build is mostly waiting, not working

[`house-schedule`](../../research/house-schedule/) modelled the build as a
chain of trades, inspections, weather and material lead times. Its zero-noise
critical path is 100 days; the baseline mean is 214 working days. The
schedule is driven by waiting, not by work.

The biggest lever in that model is ordering long-lead materials (windows,
cabinets, HVAC equipment) at day 0 instead of when the preceding task starts:
**214 to 151 working days**. An independent second model,
[`house-schedule-check`](../../research/house-schedule-check/), agreed on the
ranking: early ordering cut its mean build from 205 to 181 calendar days
(-11%). It also found that the gap between one crew leaving and the next
arriving matters more than any lever it tested: moving that gap from 0.5 to 5
working days moved the baseline from 184 to 248 days.

Then [`house-orderlead`](../../research/house-orderlead/) charged for the
cost of holding materials early. Ordering everything on day 0 saved the most
days but, with holding costs, its total cost came to 4.00% of the price,
**worse than the baseline's 3.34%**. Ordering about two lead times ahead of
the planned start did best: 182 working days and 2.91%. The 63-day saving was
the effect of an extreme policy, not its net benefit.

All three models are uncalibrated, and say so. The days are not evidence; the
ranking of levers is the output.

## 5. Factory-built shells do not pay on a small house, in these models

[`house-offsite`](../../research/house-offsite/) compared panelised walls with
site framing for a 28 x 40 ft house. The shell took 1.96 calendar days on site
and 2.17 panelised, and the panelised shell cost 38% more at assumed rates. A
fixed delivery-and-crane day is the problem: panelising only got faster from
about 58 ft of house length (at 15% weather loss).

[`house-shellvalue`](../../research/house-shellvalue/) then separated the
shell from the ordering. Compared with a site-built house ordered on the same
day, a factory shell saves **15.5 working days**, about $990 of interest on a
$450,000 house, against a $1,373 premium. So the shell does not pay below a
house price of about $629,000, with a $1,500 crane day. With a $750 crane day
it pays at every price tried. The verdict flips on the crane price and the
ordering date, not on factory productivity.

## 6. Alternative wall systems lose on first cost, win on labour

[`house-wallsystems`](../../research/house-wallsystems/) compared wood 2x6
with steel stud, insulated concrete forms (ICF), structural insulated panels
(SIP), cross-laminated timber (CLT) and 3D-printed concrete. Wood was the
cheapest system in **96.8% of 20,000 random draws**. The better-insulated ICF
and SIP walls save only about $500 of heat-loss present value against wood,
next to a $5,500 to $8,300 first-cost premium.

Where the alternatives win is labour: SIP (65 crew hours) and CLT (46) take
roughly half the 111 hours of the wood wall. The model prices that labour at
nothing beyond the per-square-foot cost, and the README says the wood-wins
result "is mostly a consequence" of its assumed input ranges.

## 7. Fees can rival framing

Not every cost is physical. `house-market` estimated that in Denver, **fees
and plan-review delay are about 12% of a new home's price** (lot excluded),
against 3.5% nationally: $45,486 in itemised fees for a 2,000 sq ft home, plus
about $9,625 in carrying cost for a 209-day plan review. For comparison, a 20%
saving on framing moves the national price 2.1%.

[`house-adufees`](../../research/house-adufees/) read one of those fees from
its source. Denver Water charges a backyard cottage (ADU) a flat $2,170 inside
its Denver service area from 1 July 2026, against $5,400 for a house charged
on 2,000 sq ft. Per square foot the 480 sq ft ADU pays more: $4.52 against
$2.70.

## What to take from it

Across 35 projects, the consistent pattern is that the parts of a house that
are easiest to optimise in code, like lumber in a wall, are a small share of
its price. The bigger levers are size, storeys, fees and time spent waiting.
The open-design cottage and the tools behind it are there to inspect, rerun
and argue with. Each project's README lists its limitations and next steps,
and the track's guardrail stands: no design here is buildable on its say-so.
