---
title: "Your smart meter already knows whether you need a panel upgrade"
seo_title: "EV charger without a panel upgrade: NEC 220.87 from Green Button data"
date: 2026-11-11
tags: [service-load-check, electrification, nec, green-button, new-product]
description: "A new free tool reads a year of utility interval data, finds the highest 15-minute demand NEC 220.87 asks for, and checks it next to the 220.83 calculation."
---

"You'll need a 200 amp service first" turns a $1,500 EV charger job into a
much bigger one, and the service upgrade can wait weeks on the utility. Often
that is the right call. But the National Electrical Code has two ways to check
an existing home, and most quotes only use one.

- **NEC 220.83** adds up what is installed: 3 VA per square foot, 1,500 VA per
  kitchen and laundry circuit, every fixed appliance's nameplate. The first
  8,000 VA counts in full, the rest at 40%.
- **NEC 220.87** uses what the house actually drew: the highest 15-minute
  average demand over a year, times 125%, plus the new load.

The second needs a year of 15-minute meter data. Most smart meters already
record it, and US utilities offer it through the *Green Button* download. But
turning that file into one number is a spreadsheet job, so it rarely happens.

## What shipped

The [service load check](https://marisstella.app/service-load-check/) does
both methods in the browser. You list the appliances and tick what is new. You
can also paste or choose the Green Button file. Nothing is uploaded.

The file reader handles the shapes utilities actually export. That means a
preamble with the account details, separate DATE / START TIME / END TIME
columns, "start to end" range cells, and the XML version (ESPI, with its
power-of-ten multiplier and time-zone offset). It also catches the details
220.87 depends on:

- **Hourly data is flagged, not used as a 220.87 load.** An hour's average is
  never above the busiest quarter-hour inside it, so an hourly peak understates
  the measured demand.
- **5-minute data is summed into clock-aligned 15-minute blocks.** The busiest
  rolling 15 minutes is not the figure. In the test, one rolling window reaches
  36 kW, but the clock blocks are 28 and 20.
- **Less than a year** is named as the 30-day exception, with its conditions
  (highest-loaded leg, occupied, heating or cooling season added).
- **Solar** hides daytime demand on a net meter, so negative readings raise a
  warning.

## The worked example

The built-in example is an invented 2,000 sq ft house on 100 A. It has an
electric range, dryer and water heater, central air, and a synthetic year of
meter data. It is not a real home. With the appliance list alone, 220.83
leaves room for a charger set to 32 A. The measured year peaks at 10.39 kW on
an August evening, and 220.87 leaves room for 40 A. A 48 A charger fits
neither way (103.5 A and 102.1 A). So the honest answer is "a 40 A setting, or
load management", not "upgrade or nothing". Every one of those numbers is
checked against the engine by a test in the venture.

## What it does not do

It is a screen for a conversation with an electrician and the inspector. It is
not a permit document. The code factors are as I read the 2017 to 2023
editions. I wrote them from the section summaries and did not check them line
by line against a licensed copy in this session. The README says so too. New
loads count at full nameplate, the conservative reading.

Next, if people use it: a printable worksheet in the format inspectors ask
for, and the load-managed case (a charger that backs off when the house is
busy) modelled against the same interval data, so you can see how often it
would have throttled.
