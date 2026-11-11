---
title: "A battery on a time-of-use rate: demand caps first, then a dynamic programme"
seo_title: "Battery peak shaving and TOU arbitrage from your interval data"
date: 2026-11-11
tags: [demand-charge-interval-analyzer, energy, batteries, algorithms, dynamic-programming]
description: "The demand charge analyzer now plans one battery against a full time-of-use bill: facility and on-peak demand plus on/off-peak energy."
---

The [demand charge analyzer](https://marisstella.app/demand-charge-interval-analyzer/)
already answered one question: what would a battery of a given size do to the
highest 15 minutes of each month? Many commercial tariffs bill more than that
one number, though. A typical time-of-use rate has three parts:

- a **facility demand charge** on the month's highest interval, at any hour;
- an **on-peak demand charge** on the highest interval inside a window such as
  weekdays 4 to 9 pm;
- **energy prices** that are higher on-peak than off-peak.

A battery earns from all three, and the parts pull against each other. Holding
the on-peak peak down means keeping the battery charged going into the window;
energy trading wants it empty by the end of the window and refilled overnight.
So the tool now plans a battery against the whole bill.

## How it plans

Month by month, in two steps.

**1. Demand caps.** For a pair of caps (one on every interval, a lower one on
on-peak intervals) there is a simple exact test of whether the battery can hold
them: discharge whenever load is above that interval's cap, recharge as fast as
the cap and the inverter allow whenever it is not. This keeps the battery as
full as possible at every moment, and the only way to fail is running out of
stored energy or inverter power, so if any controller can hold the caps, this
one can. The tool scans the facility cap, finds the lowest on-peak cap that
still holds for each one by bisection, and keeps the pair with the lowest
demand cost.

**2. Energy.** Within those caps a backward dynamic programme over the battery's
charge level picks, interval by interval, when to charge and discharge for the
cheapest energy bill. It never exports, respects the inverter rating, loses
energy at the square root of the round-trip efficiency each way, starts the
month full and pays to refill at month end, so it cannot "spend" the charge it
started with.

Each month then keeps the cheapest of four plans: no battery, peak shaving only,
peak shaving plus trading, and trading only. The result is never worse than the
peak-shaving answer the tool gave before. It is not a joint optimum (step 1
fixes the caps before step 2 sees prices), and like the earlier model it knows
the month's load in advance, so a real controller saves somewhat less.

## A rule the tests pin down

Trading pays only if the on-peak price, times the round-trip efficiency, beats
the off-peak price. One stored kWh delivers `sqrt(rt)` kWh on-peak and costs
`1 / sqrt(rt)` kWh to put back off-peak, so the condition is
`on-peak price x rt > off-peak price`. At 81% round trip, 40 kWh moved each
weekday from $0.10 to $0.30 is worth $6.36 a day rather than the lossless $8.00;
the tests check the programme lands within 1% of that hand arithmetic, and that
a spread of $0.105 against $0.10, below the loss, is not traded at all.

A second test checks the tariff logic rather than the arithmetic: with an
on-peak demand charge and no facility charge, a daily 3 am spike to 60 kW is
left alone and the battery goes to the 5 pm spike instead.

## On the example data

The page's example is a **synthetic** small shop (not a real site), with an
$18/kW facility charge, an $8/kW on-peak charge and $0.22 / $0.11 energy. For
the fastest-payback size in its table, 4.4 kW for half an hour, the plan saves
about $1,173 a year in demand charges and $45 in energy. Larger batteries make
more from trading: at 17.5 kW and 2 hours the energy saving is about $730 a
year on the same data. These are numbers about made-up readings; paste your own.

## Not modelled

Holidays, seasonal and mid-peak windows, seasonal demand rates, power factor,
degradation, incentives and export credits. The code, the tests and the full
model are in the
[venture README](../../ventures/demand-charge-interval-analyzer/README.md).
