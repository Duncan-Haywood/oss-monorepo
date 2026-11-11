---
title: "What a filter costs the ducts: a free duct sizer that starts from the blower's static pressure"
seo_title: "Duct size calculator by friction rate, with the physics shown"
date: 2026-11-11
tags: [hvac, hvac-load-calc, ducts, construction, darcy-weisbach, open-source]
description: "The HVAC load calculator now sizes every duct by friction rate. On its example house, a filter losing 0.1 in. w.c. more turns an 8-inch run into a 10-inch one."
---

The [room-by-room HVAC load calculator](../../ventures/hvac-load-calc/)
has always ended with a number per room: the airflow a duct designer would
size that room's run for. It stopped there. Its sibling, the
[wall-framing takeoff](../../ventures/wall-framing-takeoff/), counts duct
sticks and flex rolls but says plainly that it does no duct sizing. So the
step between "this bedroom needs 154 cfm" and "run an 8-inch duct to it" was
left to a rule of thumb or a cardboard duct slide rule.

It now has a [duct sizing page](../../ventures/hvac-load-calc/ducts.html)
and a `--ducts` flag on the CLI.

## How it sizes

The method is the friction-rate one most residential duct design uses, built
here from open physics rather than anyone's tables:

1. **What the ducts may spend.** The blower is rated to push its airflow
   against some external static pressure, often 0.5 in. w.c. The coil, the
   filter, a supply register and a return grille each take a share at that
   airflow. What is left is all the ductwork gets.
2. **Over how far.** Spread that over the longest supply path plus the
   longest return path, counted as total effective length (straight feet plus
   the equivalent length of every fitting, which you type from your fitting
   maker's data). The result is the design friction rate, in inches of water
   per 100 ft.
3. **Each run.** For every listed round size, the loss per 100 ft comes from
   Darcy-Weisbach with the Colebrook friction factor, at the air density for
   the house's elevation. A run gets the smallest size at or under the
   friction rate and under a velocity limit. Trunks carry the sum of the
   rooms you assign to them, with a rectangular equivalent by Huebscher's
   formula. Each run also reports what its balancing damper must throttle,
   because a short run near the air handler has pressure the long run used.

As a check on the units, the tests compare the engine with a widely quoted
power-law fit for galvanized duct, Δp = 0.109136 q^1.9 / D^5.02. At the
default roughness of 0.0003 ft the engine comes out 3 to 9% lower across 50
to 2,000 cfm; at 0.0005 ft it lands within 5% of the fit at every point
tested.

## What the example house shows

The example is the calculator's illustrative 1,800 ft² ranch (made-up
inputs, not a measured house), with effective lengths of 90 to 185 ft per
run and a 60 ft return. All figures below are the engine's output.

- With a 0.5 in. w.c. blower and the page's example component losses
  (coil 0.20, filter 0.10, register and grille 0.03 each), the ducts get
  **0.14 in. w.c.**, a design friction rate of **0.057 per 100 ft**. The
  bedrooms come out at 7 and 8 in., the living room at 10 in., the two trunks
  at 12 and 14 in., the central return at 18 in.
- **Swap in a filter that loses 0.2 instead of 0.1** (a denser filter at
  the same airflow) and the ducts are left with 0.04 in. w.c.: the friction
  rate falls to 0.016, the primary bedroom run grows from 8 to 10 in., the
  living room from 10 to 14 in., the return from 18 to 22 in., and the page
  warns that the ducts are coming out large. Push the filter loss to 0.25 and
  the components alone use more than the blower has; the page refuses to
  size anything and says why.
- **A blower rated for 0.8 in. w.c.** instead of 0.5 lifts the friction rate
  to 0.180, and every bedroom run shrinks by one or two sizes.
- **Flex pulled tight** (0.003 ft roughness, a rough assumption the page
  labels as such) makes the living room run 12 in. instead of 10 and the
  primary bedroom 9 instead of 8. Flex that sags loses much more.

The filter line is the one worth taking away. The pressure a filter costs
comes straight out of the ductwork's budget, and on a system with 0.14 in. to
spare, a tenth of an inch is most of it.

## What it does not do

It is not ACCA Manual D and uses none of its tables or fitting equivalent
lengths. It sizes each trunk for the air at its start rather than reducing it
section by section, and it does not check register throw or noise, duct heat
gain or leakage, or whether the blower's fan curve actually delivers the
airflow at the resulting pressure. The results are estimates, not engineering
advice; many permits need a duct design from approved software or a qualified
designer.

The page runs in the browser and uploads nothing. The engine is
`ventures/hvac-load-calc/duct.mjs`, MIT licensed.
