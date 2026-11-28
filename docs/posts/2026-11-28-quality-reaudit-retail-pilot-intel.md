---
title: "Re-audit: Retail Pilot Intel counts the right store on the right Rome day; a till clock still fooled it"
seo_title: "Store conversion by local day: POS timestamps need a time zone"
date: 2026-11-28
tags: [quality-audit, evaluation, retail, retail-pilot-intel]
description: "Retail Pilot Intel re-checked against its 2026-11-19 audit: the high defect is closed, 6 of 11 fixed, and claims and fitness still miss the bar."
---

Retail Pilot Intel joins door counts to point-of-sale receipts so a small shop
can see its conversion rate (sales divided by people who walked in) and revenue
per visitor. The first pilot is a leather boutique in Italy. The
[2026-11-19 audit](../../portfolio/quality/audits/2026-11-19-retail-pilot-intel.json)
found eleven defects. The worst one: days were UTC calendar days, and stores were
never kept apart. So a sale at 00:30 in Rome, or a receipt from a second store,
moved into the wrong store's day. This re-check tested all eleven against the code
on `main` today. The full record is in the
[re-audit file](../../portfolio/quality/audits/2026-11-28-retail-pilot-intel-reaudit.json).

**Verdict: below the bar on claims, and not finished.** Correctness and
verification now reach 3. Claims score 2 and fitness 1.

## What the fixes closed

I ran the real pipeline on a scratch database: the shipped sample export, a
discount receipt (a €300 bag with a €30 discount line), two 00:30 Rome sales on
the next day, one of them from a second store, and 47 hand-written door
entries. The report for 2026-08-19 gave 4 purchases, €1,308.00, a conversion rate
of 0.0851 and €27.83 per entrant. Python's `csv` module over the same rows gives
30,300 + 9,500 + 64,000 + 27,000 = 130,800 cents, 4 / 47 = 0.0851 and
130,800 / 47 = 2,782.98 cents. The 00:30 sales land on 08-20, as they should.
The day boundaries for Rome on both 2026 clock-change days (23 hours on 29 March,
25 hours on 25 October) match Python's `zoneinfo`. A day with two stores, or with
sales in euros and dollars, now stops with an error instead of adding them up.

Also closed: `pnpm bootstrap` used to print a report of zeros and now prints its
sample sale, labelled as a pipeline check. The README no longer links to a live
page that returned 404. The portal no longer claims hourly Europe/Rome buckets
that don't exist. And the ROI pages now count gross profit: at €180 to €450 per
sale and 55% to 70% margin, one sale earns €99 to €315, so the €149 to €249 Core
plan takes about 0.5 to 2.5 extra sales a month.

| prior defect | status on arrival |
|---|---|
| UTC days, stores mixed, currencies summed (high) | closed |
| README live page false | closed |
| portal claims Rome hourly buckets | closed |
| sales arithmetic overstated | partial: the README kept "one extra sale a month" |
| tests miss core revenue logic | partial: 4 of 6 survivors caught, rounding still not |
| discount line dropped, basket kept at gross | closed |
| bootstrap report all zeros | closed |
| SKU gap and experiments presented as built | partial: site and `llms.txt` still said so |
| no Statuto dei Lavoratori art. 4 | open |
| semicolon export imports nothing | open |
| database handle per call | partial |

## What is new

**A till's local clock.** Many POS exports write `2026-08-19T23:30:00` with no
time zone. The importer passed that string to `new Date()`, which reads it in the
time zone of *whatever machine runs the import*. On a UTC server, 23:30 in Rome
became 23:30 UTC, which is 01:30 the next day in Rome. On a New York laptop it
became 03:30 UTC the next day. So the same file gave different daily numbers
depending on where it was imported. This session's fix reads a time without an
offset as the store's own wall-clock time (Europe/Rome unless `--tz` says
otherwise). Tests pin the expected instants to `zoneinfo`, including 01:30 on the
morning the clocks go forward.

**Money relabelled.** A currency column holding `usd` or `US$` became EUR without
a warning and was added to euro revenue. Codes are now upper-cased, and anything
that isn't a three-letter ISO 4217 code is rejected.

**"Open-source" on an all-rights-reserved product.** The product page and
`llms.txt` called it open-source and promised "SKU gaps, experiments and ROI
reporting". The licence is all rights reserved, and those screens show
illustrative data. Both now say source-visible, and say what it does compute.

**Tests.** I seeded 10 bugs by hand. The tests caught 7 of them, up from 5 of 11.
Two rounding changes survived (`Math.round` to `Math.floor` for revenue per
entrant and average basket), as they did last time, because the only test case
divided evenly. New tests use 103,800 / 47 and 1,001 / 2, and both mutants now
fail. Scores are recorded before these fixes; a later round re-checks them.

## Still not at the bar

- There is no door-counter import, so a shop owner can't get a conversion rate
  without writing JSON by hand. This is why fitness scores 1.
- A semicolon-delimited export with euro decimals, common in Italy, imports
  nothing, and the error says every row is "missing" columns.
- The privacy page doesn't mention Statuto dei Lavoratori art. 4. In Italy, a
  camera that can see staff needs a union agreement or authorisation from the
  Ispettorato del Lavoro.
- One malformed file in the inbox stops the whole sync, and the error doesn't
  say which file.
- In a time zone whose clocks change at midnight (Havana, Santiago), the first
  hour of that day goes to the day before. Rome is not affected.

These are listed in the product's README under "Known gaps".
