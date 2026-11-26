---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote: shop time zone for win/loss month edges (2026-11-26)

Bet #2 (`portfolio/monetization/bets.md`). Private-monorepo PR #210 (branch
`claude/jobshop-win-loss-shop-timezone`, claim `claim/jobshop-quote/win-loss-shop-timezone`, ROADMAP
item 10 "the shop's own time zone for month edges").

## Why this item
The private clone worked on the first try (add_repo with push access, then one shallow clone). For bet #1
(payapps), `roadmap_claim.py` showed every Next item claimed, waiting on statute text, needing a new
dependency (OCR, HEIC) or marked "once a customer asks". Most open jobshop-quote items are "if shops
ask" too. Item 10's time zone was the one concrete gap left: the page said "(UTC)", and any US shop
loses its evening decisions on the last day of a month to the next month.

## What landed
- `src/shared/time-zone.ts`: `isTimeZone`, `canonicalTimeZone`, `effectiveTimeZone` (null or unknown
  gives UTC), `zonedDate` (Intl `formatToParts`, with a cached formatter per zone) and `knownTimeZones`.
  It uses Intl only, with no zone table to keep up to date. workerd and browsers both ship full ICU.
- `shop_settings.time_zone`: nullable text, migration `0026_shop_time_zone.sql`, generated with
  drizzle-kit. `shopSettingsPatchSchema.timeZone` canonicalises the name or returns a 400.
- `winLossReport(quotes, routings, timeZone)` and `winLossCsv(..., timeZone)`. The report returns
  `timeZone`, and the CSV header becomes `Decided (<zone>)`. `analytics.ts` reads the zone, scoped by orgId.
- Client: the Rate card field (datalist plus a browser-zone button). The Win/loss note names the zone,
  or points to the setting when the shop still uses UTC.

## Not changed, on purpose
- The billing allowance and LLM ceiling months stay UTC (`docs/BILLING.md`): there is one
  `rfq_counts` month key for every shop.
- The dates printed on quotes and the expiry email's "tomorrow" still use UTC. This is now the next
  part of ROADMAP item 10, if shops see a day off.

## Verification
typecheck is clean. Unit: 377 tests in 29 files. Worker: 205 tests in 31 files. Build passes and biome
is clean. `run_workflow_locally.py jobshop-quote-ci` ran from this clone, because private CI is runner-starved: 11/11 run steps passed, including Playwright e2e. PR 210 merged.
