---
title: "What does a designer coat cost to make? 45 open models of engineered clothing"
seo_title: "What does a designer coat cost to make?"
date: 2026-10-20
description: "Garment cost teardowns, cutting waste, sizing, thermal comfort, exosuits and RF fabrics: what 45 open clothing models found, and how far to trust them."
tags: [research, clothing, textiles, operations-research, open-source]
---

# What does a designer coat cost to make? 45 open models of engineered clothing

A designer coat sells for thousands of dollars. How much of that is cloth and
sewing, and how close can a $20 to $50 build get? And with a few hundred
dollars of real budget, what can materials science, mechanics and electronics
do for clothes?

Those are the two questions of the engineered-clothing research track in this
repository. Its brief is section 6 of
[`research/PROJECTS.md`](../../research/PROJECTS.md). It has produced 45 small
projects so far, each a directory under `research/garment-*` with code, tests,
a committed results file and a README. This post pulls out the findings that
seemed most useful, with the numbers taken from each project's README.

**Who did this.** The work was done by AI coding agents (Claude) running
unattended in scheduled sessions, with the repository's owner setting the
direction and guardrails. No tailor, textile engineer or physiologist has
reviewed it.

## Read this first

Nearly every one of these READMEs is labelled "stylised", and the label is
earned. Cost inputs are round-number assumptions. The two retail prices came
from search-result snippets, not fetched pages. Fabric properties are assumed,
not measured. The bodies are stacks of ellipses or synthetic gait curves.
Nothing was sewn, bought, worn or tested. Read the results as sensitivity
studies: which levers matter inside a model, not what a real garment does. None
of this is professional engineering, safety or purchasing advice.

## 1. Factory cost is a small slice of a designer price

[`garment-teardown`](../../research/garment-teardown/) builds a bottom-up cost
model (pattern area, marker efficiency, cloth price, trims, sewing minutes
times wage, overhead) and applies it to two coats with reported prices.

| | reported price | modelled factory cost, mid wage | share of price |
|---|---|---|---|
| trench coat | $2,850 | $204 | 7% |
| wool-blend coat | $3,850 | $493 | 13% |

Across three wage scenarios the factory cost stays under 15% of the price.
Fabric dominates it, and a 25% change in cloth price moves the trench's cost by
16% against 3% for the same change in wage. The README is candid about what it
cannot explain: its assumed brand and retail markups price the trench at about
$900 to $1,200, well short of $2,850, so the rest is an unexplained residual.

The replica costs $46 to $81 (trench) across the wage scenarios. Only the
leanest case, very cheap cloth and low-wage or home labour, reaches $29. A
follow-up, [`garment-costperwear`](../../research/garment-costperwear/), asks
how long the $2,850 coat must last to beat a $56 replica per wear: 45.6 times
as many wears with no resale and equal care. With the replica lasting 60
wears, the designer coat breaks even on a coin flip only at a median life of
about 3,100 wears. Care cost is the lever that most helps the replica.

## 2. Cutting waste: a cheap heuristic is not enough, a cheap search nearly is

Laying pattern pieces on cloth is a strip-packing problem.
[`garment-nesting`](../../research/garment-nesting/) compared shelf heuristics,
bottom-left placement, simulated annealing and an exact mixed-integer program
on 20 small random markers. The exact solver proved optimality on 19.

| method | mean gap to optimum |
|---|---|
| shelf packing (NFDH) | 19.8% |
| bottom-left, largest first | 7.3% |
| simulated annealing, 500 decodes | 0.5% |

Packing true polygons instead of bounding boxes shortened markers by 5% to 43%,
most for skirt gores that interlock when turned 180 degrees. At an assumed
$7/m², that is worth $0.92 to $6.04 of cloth per garment.

Two follow-ups temper this. [`garment-nestcost`](../../research/garment-nestcost/)
found that with a 1.5 cm seam allowance its coat shell reaches only 0.68 to
0.73 efficiency, below the 0.80 the teardown assumed.
[`garment-cutplan`](../../research/garment-cutplan/) found that putting several
garments in one marker saves 9.3% to 10.7% of cloth, but the extra gain from
mixing sizes was mostly the optimiser picking lucky markers: re-nested with
fresh seeds, the "optimal" plan ended 0.09% longer than the simple one.

## 3. Sizing: a regular grid is fine until measurements correlate

[`garment-sizeset`](../../research/garment-sizeset/) asked how many sizes fit a
synthetic population within ±4 cm. When bust and hip are strongly correlated
(rho 0.9), eight optimised sizes fitted 0.871 of a fresh 20,000 people against
0.677 for a regular grid. When they are uncorrelated, the optimised set was no
better than the grid on fresh people, because it overfitted the 300-person
sample. [`garment-sizestretch`](../../research/garment-sizestretch/) adds
stretch: at rho 0.5, fitting 80% of people takes 8 sizes with no stretch, 4 at
5% stretch, 2 at 10% and 1 at 20%.

## 4. Thermal comfort: which fabric property matters depends on where you are

[`garment-thermal`](../../research/garment-thermal/) extends the ISO 7730
comfort index with four fabric properties. Its no-optics core agrees with the
open `pythermalcomfort` implementation to within 0.0062 PMV over 144
conditions. Inside the model:

- In a 28 °C room, a cloth that passes 80% of body infrared feels like a room
  2.4 °C cooler. In a 16 °C room the same cloth feels 7.3 °C colder.
- Outdoors in sun, white against dark cloth is a 7.7 °C span, while infrared
  transmittance moves comfort by 0.3 °C.

The fleet then checked its own two-node body model against an open
implementation. [`garment-twonodecheck`](../../research/garment-twonodecheck/)
found core temperature within 0.25 °C, but skin temperature off by 0.58 °C on
average and up to 2.1 °C. [`garment-twonodeoptics`](../../research/garment-twonodeoptics/)
found the rankings of fabric properties survive the swap, while the sizes move
by up to a factor of two. And
[`garment-wearmix`](../../research/garment-wearmix/) weights the levers by where
a garment is worn: a fixed infrared-transparent shell pays only if warm rooms
take more than 75.5% of wearing time (when the rest is a cool room). White
cloth never hurts in the model and is the best lever per dollar in all four wearing mixes
it compares.

## 5. Exosuits: the motor, not the battery, decides

[`garment-assist`](../../research/garment-assist/) models an ankle-assist
garment against the metabolic cost of carrying it. The answer rests on one
unsourced number, the cost per kilogram of added mass: break-even is 8.9 kg at
1% per kg and 1.8 kg at 5% per kg. [`garment-assistpower`](../../research/garment-assistpower/)
adds a motor and battery. At an assumed 8 N·m/kg motor, the suit weighs about
9 kg, 8.4 kg of it motor, and raises whole-body cost (+1.0% with a 4-hour
battery). At 40 N·m/kg it saves 5.7%.

## 6. Protective and smart fabrics

[`garment-protective`](../../research/garment-protective/) uses a recalled
Cunniff-style scaling. It finds that a suit-like panel (at most 3 mm and 1 kg)
reaches 0.50 to 0.84 of a 4 kg/m² aramid reference for aramid, and 0.60 to 1.18
for UHMWPE, depending on an unknown exponent. It is explicit that this is
modelling only. A garment is armour only after certified testing, such as to
NIJ Standard 0101.07.

[`garment-smart`](../../research/garment-smart/) trains an activity classifier
on synthetic sensor signals. The one informative result is fragility: if the
garment slips (sensor rotation with a standard deviation of 1.0 rad),
accuracy falls from 99.9% to 45.2%. Training with slip brings it back to 94.4%.

For RF-shielding cloth, [`garment-optics`](../../research/garment-optics/) finds
the weave's gaps, not yarn conductivity, set shielding above about 1 GHz: a
1 mm pitch gives 36.4 dB at 2.4 GHz and about 15 dB at 28 GHz.

## Does the work reproduce?

A separate project, [`swe-audit`](../../research/swe-audit/), re-ran a random
sample of 40 research projects. Two garment projects were in it, `garment-nesting` and
`garment-markercost`. Both reproduced their committed results except for one
timing line.

## Caveats beyond the models

The track also shows a fleet habit worth naming. Fifteen of the 45 projects are
`garment-twonode*` follow-ups, and the track's own measurement work in
[`swe-value`](../../research/swe-value/) asks whether chains like that are worth
as much per token as new milestones. Several are real checks of earlier
results, and those checks found real gaps. Others are small variations.

What would move these results from models to evidence is listed in each README
as an owner step: sew a muslin, cut a real marker, measure a fabric's infrared
transmittance or shielding. None has been done yet.

For how the agent fleet itself runs, see
[Throughput per unit of supervision](2026-10-16-throughput-per-unit-of-supervision.md).
