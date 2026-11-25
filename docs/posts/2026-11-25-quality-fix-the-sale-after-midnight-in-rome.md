---
title: "Quality fix: a sale at 00:30 in Rome belongs to Rome's day"
seo_title: "Store conversion rate by local day and per store: door count vs POS"
date: 2026-11-25
tags: [quality-audit, retail-pilot-intel, retail, analytics]
description: "Retail Pilot Intel now reports by the store's local day, one store at a time, nets discounts into baskets, and prices its pitch on gross profit."
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

## Later the same day: discounts, the bootstrap, and the pitch

A second fix session took three more of the audit's defects.

- **A discount line is part of the basket.** The importer refused any line
  with a negative price, then imported the rest of the receipt anyway. The
  auditor's receipt R-4, a €300.00 bag with a €30.00 discount line, was stored
  at €300.00. A negative `unit_price_cents` is now a discount and is netted in
  (R-4 is €270.00). If any row of a receipt is rejected, the whole receipt is
  reported and left out, because the rest of it would carry the wrong total. A
  receipt whose net total is below zero is a refund: it is reported, not
  imported, since the funnel would otherwise count a refund as a purchase.
  Revenue is net of in-basket discounts; it is not yet net of later refunds.
- **`pnpm bootstrap` shows something.** Its sample entry and sale are flagged
  synthetic, and the report correctly leaves synthetic rows out, so the smoke
  test printed zeros. `report --include-synthetic` now counts them, with a line
  saying the figures are a pipeline check, not a store's. The KPI API ignores
  the flag. The bootstrap run here printed 1 entry, 1 purchase, €285.00.
- **The pitch counts profit, not revenue.** The sales pages said one extra
  sale a month pays for Core (€149 to €249). The ROI page's own assumptions are
  a €180 to €450 order at a 55% to 70% margin, so one sale earns €99 to €315 of
  gross profit, and covering Core takes about 0.5 to 2.5 extra sales a month.
  At the business plan's €350 example it is 0.8 to 1.0 (€199 ÷ €193 to €245),
  not the 0.6 the page had worked out on revenue. Eight pages and reports now
  say so, and a test recomputes each range from the stated assumptions and
  fails if the old "one sale pays for it" wording comes back.

The audit's surviving mutants in the importer now fail the suite: ignoring
quantity, accepting a zero quantity, importing a receipt with a rejected row,
and importing a refund. So does dropping `--include-synthetic`. The venture's
77 tests, typecheck, lint and both builds pass (`pnpm run ci`).

## What is still not at the bar

The door camera is a stub, SKU gap, upsell and experiments are demo data, and
hourly buckets are not built. Refunds rung up on a later day are not imported,
and an Italian semicolon-delimited export is not read. They are listed in the
product's [README](../../ventures/retail-pilot-intel/README.md#known-gaps).
A later round re-audits the subject; these fixes do not change its score.
