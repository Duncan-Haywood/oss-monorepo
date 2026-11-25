---
title: "Recession dates on the data as published: two of six turns moved four months"
seo_title: "Real-time recession dating on FRED-MD vintages, 1999-2021"
date: 2026-11-24
tags: [business-cycles, real-time-data, fred-md, changepoint-detector]
description: "We replayed a coincident composite on 267 FRED-MD vintages. All six turns since 1999 were found but the 2001 peak and 2009 trough sat four months off for years."
---

[Changepoint Detector](../../ventures/changepoint-detector/) can date peaks
and troughs in a composite of several monthly series (`--turns --columns`),
using a Bry-Boschan rule. Earlier rounds checked it in pseudo-real time: cut
today's data at each month and ask when a turn would have been called. That
ignores revisions. This round used the data as it was actually published.

## The data

FRED-MD, the St. Louis Fed's monthly macro database, keeps a snapshot of every
month's release from August 1999. A public research repository
(AQLT/turningPointsDetection) had saved the vintages of three of the
Conference Board's four coincident components: payroll employment, real income
less transfers, and industrial production. We converted those to plain CSV,
got the levels back exactly, and replayed the composite at each of 267 months.
At every month it used only the vintages a user could have held then. The
baseline was the same three series from today's files, cut at the same months.
The rules and pass bars were committed before the first run.

## What happened

| NBER turn | today's data: called after | as published: called after |
|---|---|---|
| peak 2001-03 | 7 months | 156 months |
| trough 2001-11 | 8 | 61 |
| peak 2007-12 | 7 | 8 |
| trough 2009-06 | 8 | 132 |
| peak 2020-02 | 7 | 7 |
| trough 2020-04 | 7 | 7 |

Every turn was found. The very long delays come from where the composite put
them. On the 2002 to 2014 vintages it dated the 2001 peak at 2000-11 or
2000-12, three to four months before NBER's month. On most 2010 to 2020
vintages it dated the 2009 trough at 2009-10, four months late. Our call rule
needs a turn to stay within three months of NBER's date at every later month,
so a four-month shift means the call doesn't count until the data move back.
The big, sharp turns, 2008 and both 2020 turns, came out almost the same on
either data set.

Two of the four pre-registered bars failed: median delay (34.5 months against
7) and calls made before NBER's own announcement (2 of 6 against 5). So the
earlier pseudo-real-time numbers are an upper bound, not a forecast.

## What it means for a user

If you date turns on current data, the month of a mild turn can still shift by
a quarter or more as the components get revised. A deep turn stays put. No
default in the tool changes: none of them depended on those replays. The
README now says how much revisions cost.

Next is a call rule that accepts a dated month moving by a few months, judged
on these same vintages, and the fourth component (real manufacturing and trade
sales) once a copy of its vintages is reachable.

Full tables, rules and caveats: the venture README, section "Turns on real
vintages". Script: `eval/turns-vintages.mjs`.
