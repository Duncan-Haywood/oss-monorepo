---
title: "pH 7.98 and still bad water: the oyster-hatchery chemistry behind a new story"
seo_title: "Why pH misleads in oyster hatcheries after rain: a sci-fi story"
date: 2026-11-11
tags: [fiction, hearth-and-horizon, science-fiction, ocean-acidification, oysters, aquaculture, oregon, carbonate-chemistry]
description: "A new story set in an Oregon oyster hatchery in 2047: after a May storm the pH looks normal, the saturation state is not, and the larvae pay."
---

[The Rule for After Rain](../../ventures/hearth-and-horizon/stories/the-rule-for-after-rain.md)
is the newest Hearth & Horizon story. An AI wrote it. It is set in May 2047 at
an invented shellfish hatchery on an invented bay in Tillamook County,
Oregon, and it is the shelf's first story about ocean chemistry and oysters.

## The number the story turns on

Oyster larvae build their first shell out of aragonite in about two days,
before the yolk runs out. How easy the water makes that is measured by the
aragonite saturation state, written Omega:

    Omega = [Ca2+] [CO3 2-] / K'sp(aragonite)

Above 1, aragonite does not dissolve. Studies of Pacific oyster larvae on
this coast in the 2010s found that the first shell suffers below about 1.5,
and that it tracks Omega itself rather than pH as such. The story's hatchery
uses 1.5 as its fill line.

The usual danger on the Oregon coast is upwelled water: cold, old, full of
carbon dioxide, coming in on north winds in spring and summer. That water is
easy to spot. It is cold and its pH is low. With the story's numbers it reads
9 C, pH 7.74, Omega 1.0.

## Why rain fools a pH meter

The story's storm is a different case. After 3.4 inches of rain the bay is
about a quarter river water. River water here carries a fraction of the sea's
alkalinity and almost none of its calcium, so diluting the sea lowers Omega
even though the water is warm and the pH barely moves.

The worked numbers (a short script, standard constants: Lueker et al. 2000,
Dickson 1990, Mucci 1983, no phosphate or silicate):

| Water | T (C) | Salinity | Alkalinity | pH | Omega |
|---|---|---|---|---|---|
| Normal afternoon bay | 14 | 32.5 | 2,210 | 8.17 | 2.7 |
| Upwelled | 9 | 33.8 | 2,260 | 7.74 | 1.0 |
| After the storm (about 23% river) | 14 | 25 | 1,792 | 7.98 | 1.32 |
| Same pH, read with the dry-season constants | 14 | 32.5 (assumed) | 2,210 (assumed) | 7.98 | 1.89 |

The last row is the story's mistake. The hatchery's assistant had worked
Omega from pH and temperature with alkalinity held at its spawning-season
mean, because in four dry seasons that mean never moved by more than two
percent. On a warm Saturday after the storm it read 1.89, said "fill", and a
hundred and twenty million eggs went into water at 1.32. Two days later
about 17% had made a normal shell.

The river's alkalinity (400 micromoles per kilogram) and the storm's extra
carbon are assumptions, stated in the story's note. The direction of the
effect is not an assumption: dilution with low-alkalinity fresh water lowers
saturation state, and a pH reading alone cannot see it.

## A teacup of soda ash

The fix that hatcheries on this coast adopted after the die-offs of the late
2000s is to put the carbonate back: buffer the intake with sodium carbonate.
Each micromole added raises alkalinity by two and dissolved carbon by one.
For the storm water:

- 110 micromoles per kilogram brings Omega from 1.32 to 2.50;
- a 6,000-litre tank at about 1.019 kg per litre is about 6,110 kg;
- 6,110 kg times 110 micromoles is 0.67 moles, or about 71 grams at 106 grams
  per mole.

Seventy-one grams separates a dead spawn from a good one. The catch is that
the dose depends on the alkalinity, and the assistant's alkalinity was a
guess. So the story's rule becomes: under salinity 30, titrate first. A
simplified Gran titration of 100 g of the storm water takes 1.79 mL of 0.1
normal acid, which is 1,790 micromoles per kilogram, and the dose is worked
from that.

## What the people do

The chemistry is half the story. The other half is what the manager does
with a state relief fund that pays for losses from "corrosive water
conditions that could not reasonably have been detected". The probe on the
pipe had read 25 all afternoon, and her old teacher's notebook, which the
assistant had read, said "after a big rain, believe the refractometer, not the
pH meter". She ticks the box that says it could have been detected. The
assistant writes the incident report and declines to answer that box for her.
The cooperative's growers then share the shortfall, and the oldest of them
gives his seed to the smallest leases.

The fund, the hatchery, the bay and every reading in the story are invented.
The history in outline is real: Pacific Northwest hatcheries did lose larvae
for several springs in the late 2000s before researchers traced it to
corrosive upwelled water.

The story is text only for now: the shelf's audio is over its size cap. It
is CC BY-SA 4.0, like the rest of the shelf.
