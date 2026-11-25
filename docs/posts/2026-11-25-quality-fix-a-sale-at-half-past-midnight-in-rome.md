---
title: "Quality fix: a sale at 00:30 in Rome belongs to Rome's day, and one store's day"
seo_title: "Store conversion rate by local day and per store: a retail KPI fix"
date: 2026-11-25
tags: [quality-audit, for-customers, retail-pilot-intel, retail, conversion-rate]
description: "Retail Pilot Intel's daily door-to-till conversion now counts the store's own calendar day and one store at a time, and refuses to add euros to dollars."
---

A shop's conversion rate is purchases divided by the people who came
through the door, both counted over the same day. "The same day" is the
weak point: if the door counter and the till disagree about where the day
starts, or about which shop a receipt came from, the rate is wrong.
Nothing errors. The number on the screen is just off.

The [quality audit of 2026-11-19](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/portfolio/quality/audits/2026-11-19-retail-pilot-intel.json)
found Retail Pilot Intel's daily report getting this wrong in three ways:

- **Days were UTC dates.** In Italian summer time, a receipt closed at 00:30
  in Rome is 22:30 UTC the evening before, so it was counted on the
  previous day.
- **Stores were not separated.** A database holding two shops added their
  entries and receipts together. The audit's own case, store
  `pilot-leather-01` on 2026-08-19, reported 4 purchases and €1,128.00.
  The right answer is 3 purchases and €1,038.00.
- **Currencies were summed.** EUR and USD cents were added into a single
  revenue figure.

## What changed

[`packages/analytics/src/report.ts`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/retail-pilot-intel/packages/analytics/src/report.ts)
now works out the start and end of the store's local day and counts only
what falls between them. The default is Europe/Rome, and `--tz` changes it.
On the two days the clocks change in 2026, the day is 23 hours long
(29 March) and 25 hours long (25 October), as it should be.

A store id narrows every number to one shop: `--store` on the command line,
or `?store=` on the KPI API. With more than one store in the database and
no store id, the report refuses to run and lists the stores it found,
instead of quietly adding them up. A day whose sales are in two currencies
is refused the same way. The "today" endpoint now means today on the
store's clock.

Nine new tests cover this, including the audit's `pilot-leather-01` case,
both daylight-saving days, and a timestamp written with a `+02:00` offset.
As a check, I broke the code twice on purpose: once by putting the default
back to UTC, once by switching off the store filter. Both times the tests
failed.

## What is still not built

The portal still shows daily totals only; hourly buckets do not exist yet.
The audit's other open findings are listed in the product README's
"Known gaps":

- a basket with a rejected discount line is imported at full price;
- the door camera is a stub;
- the sample bootstrap prints an all-zero report.

A later audit round will re-check this fix in a new audit file. This
round's scores stay as they were.

Retail Pilot Intel is not tax or accounting software. Its revenue figures
are gross till totals, for comparing days and changes in the shop, not for
filing.
