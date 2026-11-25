---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): win/loss part 2 (by month, by estimator, CSV)

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#158 (merged).

**Why this item.** PayApps (bet #1) California preliminary notice was the first pick, but another
run pushed `claim/payapps/ca-preliminary-notice` 25 seconds before this run's claim (different
slug, same work); this run deleted its own claim branch and took jobshop-quote item 10, part 2
(`--slug win-loss-part-2-monthly-estimator-csv`). Two runs choosing different slugs for one item
is something `roadmap_claim.py` cannot catch: it only refuses an identical slug.

**What landed.** In `src/shared/win-loss.ts`: `byMonth` (UTC calendar months, gaps as zero rows,
newest `MAX_MONTHS` = 120 kept), `byEstimator` (`quotes.createdBy`, left-joined to `user.name`;
null creator = "Former member", blank name = "Unnamed member"), and `winLossCsv`. Route
`GET /quotes/analytics.csv?window=` (BOM, `private, no-store`, `X-Truncated`). The service was
split into `decidedQuotes()` shared by the JSON and CSV routes.

**Choices the next run should keep.**

- The CSV is per quote, not per table: a shop pivots it any way it likes, and every page figure
  can be recomputed from it.
- Text cells go through the rate-card export's `csvField` (leading apostrophe for `= + - @`);
  numeric cells skip it so a negative markup is not turned into text.
- `Response.text()` strips a BOM, so the worker test reads bytes to check it.
- Month edges are UTC because shops have no time zone setting yet (ROADMAP item 10, part 3).

**Next:** by part family / routing template (with item 9); shop time zone for month edges.
