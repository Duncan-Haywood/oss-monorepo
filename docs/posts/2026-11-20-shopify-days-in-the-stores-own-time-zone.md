---
title: "A fixed UTC offset is wrong half the year: Shopify days now follow the store's own time zone"
seo_title: "Shopify daily metrics in the store's own time zone"
date: 2026-11-20
tags: [changepoint-detection, shopify, time-zones, bugfix]
description: "The metric watch's Shopify source bucketed days at a fixed offset, so New York stores lost their last hour to the next day all summer. It now asks the store."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md)'s daily watch can read a Shopify store
directly. `shopify-metrics.mjs` turns the store's orders into one row a day (orders, revenue, cancellations), and
the watch says when one of them has really changed. Yesterday's quality audit found a quiet fault in how it decided
which day an order belongs to.

## What was wrong

Days were cut at a fixed offset from UTC, `--utc-offset`, and the watch page told a New York merchant to set `-5`.
New York is five hours behind UTC only from November to March. From March to November it is four, so every order
placed between 23:00 and midnight local time was written on the next day's row. On the two days a year the clocks
change, the boundary moved by an hour.

That does more harm than its size suggests. A watch looks for lasting shifts, and it learns what normal looks
like from history. When the late evening moves from one row to the next twice a year, history contains two small
steps that never happened in the shop. The CSV also stopped matching the merchant's own Shopify Analytics, so a
number the watch quoted could not be checked against the dashboard.

## The fix

Every Shopify store has a time zone set in its admin, and Shopify's own reports bucket days in it. The script now
asks for it before fetching orders (`shop { ianaTimezone }`, readable with any token) and cuts days at the store's
local midnight all year. `--time-zone America/New_York` or `--utc-offset` still overrides it. If the answer has no
zone, the run falls back to UTC and says so. The Stripe source takes the same `--time-zone`. It does not read
Stripe's account zone, because a restricted key may lack that permission.

Finding when a local day starts is less trivial than subtracting an offset. Some zones skip midnight when their
clocks go forward: Santiago's day on 6 September 2026 begins at 01:00. So a day's start is defined as the first
second whose local date is that day, and it is found by bisection with `Intl` as the judge.

## How it was checked

The tests pin New York's day start at 05:00 UTC on 8 March and 04:00 UTC on 9 March (and the reverse in
November). They check Santiago's skipped midnight, Kolkata's half hour and Kiritimati's UTC+14, and that every day
of 2026 in New York, London and Sydney maps its start back to itself. Against a stand-in for Shopify's API, an order
at 00:30 New York time on 1 July lands on the 1st under the store's zone and on 30 June under the old `-5`. A given
offset sends no zone query, and a missing zone writes UTC days with a warning.

One limit is stated in the README. A CSV that already exists keeps its old days, so the first run after the change
under- or over-counts a few hours on one day at the junction. Deleting the cached CSV refetches everything in the
store's zone. Like the rest of the Shopify source, this has run against a stand-in that follows Shopify's documented
API shape, not a live store: no session holds a store's token.
