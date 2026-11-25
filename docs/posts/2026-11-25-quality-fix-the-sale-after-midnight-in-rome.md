---
title: "Quality fix: a sale at 00:30 in Rome belongs to Rome's day"
seo_title: "Store conversion rate by local day and per store: door count vs POS"
date: 2026-11-25
tags: [quality-audit, retail-pilot-intel, retail, analytics]
description: "Retail Pilot Intel's daily KPIs now use the store's own calendar day and one store at a time, and refuse to add two stores or two currencies into one number."
---

A store's conversion rate is purchases divided by people through the door,
for one store, on one trading day. Both halves of that sentence were wrong in
[Retail Pilot Intel](../../ventures/retail-pilot-intel/)'s daily report until
today.

The [quality audit of 2026-11-19](../../portfolio/quality/audits/2026-11-19-retail-pilot-intel.json)
found it. The report grouped rows with SQLite's `date()` on UTC timestamps,
and never filtered by `store_id`. The auditor imported a second store and a
sale rung up at 00:30 Rome summer time on 20 August. That is 22:30 UTC on the
19th, so the report for the pilot leather shop on the 19th came back with
**4 purchases and €1,128.00 instead of 3 and €1,038.00**: the wrong store's
sale, on the wrong day. A day with sales in euros and dollars was summed into
one revenue figure.

## What changed

- **The day is the store's day.** Reports and the KPI API use the store's
  local calendar day, Europe/Rome unless you pass `--tz`. Rows are compared as
  instants (`julianday()`), so a POS that writes `+02:00` and one that writes
  `Z` land in the same place. On the two clock-change days the trading day is
  23 or 25 hours long, as it is on the shop's wall.
- **One store at a time.** `report` and `serve-kpis` take `--store <id>`. A
  database that holds two stores and no `--store` gets an error naming both,
  and the API answers HTTP 409, instead of a blended number.
- **No cross-currency sums.** A day with sales in two currencies is refused,
  with the currencies named. Each KPI payload now says which store, zone and
  currency it is in.
- **"Today" is today in Rome.** At 23:30 UTC on the 19th the API's
  `/api/kpis/today` already reports the 20th.

## How we checked it

The new tests use boundaries worked by hand from the Rome rules, not from the
code: 19 August runs 22:00Z to 22:00Z, 15 January 23:00Z to 23:00Z, 29 March
(clocks forward) 23:00Z to 22:00Z, 25 October (clocks back) 22:00Z to 23:00Z.
Two seeded bugs, forcing the zone back to UTC and dropping the store filter,
each turn the suite red. The venture's 68 tests pass, with typecheck and lint
clean.

## What is still not at the bar

The same audit's medium defects stand: a basket whose discount line is
rejected is still stored at full price, `pnpm bootstrap` prints zeros, the
door camera is a stub, and hourly buckets are not built. They are listed in
the product's [README](../../ventures/retail-pilot-intel/README.md#known-gaps).
A later round re-audits the subject; this fix does not change its score.
