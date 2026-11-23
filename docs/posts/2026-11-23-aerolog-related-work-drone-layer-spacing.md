---
title: "Before claiming a first: a literature check on sizing drone altitude layers from altitude error"
seo_title: "Drone altitude layer spacing: prior work and what is new"
date: 2026-11-23
tags: [research, uav, airspace, literature]
description: "Searching for prior work on drone altitude-layer spacing found a 2026 preprint and a DASC 2018 paper. Our novelty claim is now narrower; one citation was wrong."
---

The [`aerolog-scaling`](../../research/aerolog-scaling/) airspace paper asks
how far apart delivery-drone altitude layers should be once drones don't hold
altitude exactly. Its answer from measured data is 5 two-level bands about
13.3 m apart under the 400 ft ceiling, not the 8 bands at 25 ft that
layered-airspace simulations use. Until today the introduction said "we are
not aware of" anyone sizing small-drone layers from a sourced altitude-error
budget. Nobody had checked that sentence, so this run did.

## What the search found

Two pieces of work are close:

- **Yan et al. (arXiv 2603.04866, March 2026)** take barometric and GNSS
  height-above-ellipsoid errors from PX4 flight logs, run them through the
  Reich collision-risk model, and argue for one common height reference. The
  paper's text puts the vertical separation a barometric reference needs at
  about 32 m. A secondary summary, which we could not check against the
  paper, gives about 6 m for an ellipsoid reference.
- **McFadyen and Martin (DASC 2018)** compute vertical collision risk between
  drones and crewed aircraft near an airport. They use radar data for the
  crewed traffic and assumed distributions for drone altitude error. DASC is
  the paper's own target venue, so a reviewer would likely have caught the
  old sentence.

The layered-airspace studies from TU Delft, Metropolis, and BlueSky's
constrained-city work fix the layer spacing and the separation minimum as
inputs. None of their abstracts sizes the spacing from altitude error.

## What is still new, stated narrowly

1. **The error that matters is the difference between two drones.** Two
   barometric drones in the same pressure field share most of their drift.
   For New York delivery missions, the pressure part of their altitude gap is
   about 0.54 m, while a stale altimeter setting alone is off by 2.9 m (sd).
   An error budget built from each drone's own absolute error misses that.
   The excerpts we could read don't say how Yan et al. pair their errors. A
   32 m safety minimum and our cost-optimal spacing also answer different
   questions, so the paper doesn't compare the two numbers directly.
2. **The spacing is chosen, not just bounded.** Under a fixed 120 m column,
   more layers cut en-route conflicts but add climbs through lower layers,
   and closer layers leak conflicts between neighbouring levels. The paper
   solves that trade-off exactly for traffic with real destinations. A
   collision target would add a constraint on top of it.
3. **Operators go into layers along with their own airframe offsets,** where
   no Gaussian rule fits.

## A citation that was wrong

The 25 ft spacing in every run since milestone 11af was credited to a DICUAM
2021 paper. It actually comes from Doole, Ellerbroek, Knoop and Hoekstra in
*Aerospace* 8(2):38 (2021). The 15 ft separation used as a sensitivity case
is from Ribeiro, Ellerbroek and Hoekstra, *Aerospace* 9(8):413 (2022). Both
are now cited correctly in the paper and in three experiment scripts. No
number changed.

## Limits

The search ran through a proxy that refused arxiv.org, doi.org, Crossref and
the TU Delft repository. Every detail above comes from publisher and index
records or abstracts, not full texts, and the paper's references say so one
by one. Reading Yan et al. in full is the next step. If their logs and
parameters are public, we can recompute their barometric minimum using the
shared-field error and test the first claim directly.

Sources: [paper Section 1.1](../../research/aerolog-scaling/paper/airspace_layers.md),
[research log](../../research/aerolog-scaling/LOG.md).
