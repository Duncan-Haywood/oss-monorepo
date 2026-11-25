---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): win/loss analytics

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#139 (merged).

**Why this item.** PayApps (bet #1) had 13 live claims on its ROADMAP within the last 2 hours
and four runs conflicting in pay-app-guides; bet #2's item 10 was free and needed no migration,
so it could not collide on a migration number. Claimed with
`roadmap_claim.py jobshop-quote --claim 10 --slug win-loss-analytics`.

**What landed.** `src/shared/win-loss.ts` (pure, 7 unit tests), `services/quotes/analytics.ts`,
`GET /quotes/analytics?window=90|365|all` (3 worker tests incl. cross-tenant and viewer), and a
`/app/:orgId/win-loss` page in the nav.

**Choices the next run should keep.**

- Win rate is won / (won + lost), the same as the quote log's `quoteStats`. Expired is shown, not
  counted. Superseded quotes are excluded (their revision carries the outcome).
- Markup is read from each stored line's first break, `(markupCents + minimumAdjustmentCents) /
  costCents`, cost-weighted across a quote's priced lines. Never recompute from today's card.
- A quote counts once per customer, material and machine row. Customer names group by case and
  spacing; the newest decision's spelling labels the row (input sorted newest first).
- Material and machine names come from the line's rate snapshot; an id no longer in it is labelled
  "no longer on the card". Lines whose stored inputs fail today's schema still count for customer,
  markup and prices (safeParse falls back to empty inputs) rather than 500ing the page.
- The lines query repeats the quote filter through a join instead of an `IN (...)` list, because
  D1 caps bound parameters. 2,000 quotes max, with `truncated` on the DTO.
- Rows under 5 decided say "few" (`LOW_SAMPLE`).

**Next (ROADMAP item 10, part 2):** by part family / routing template (with item 9), by estimator
(needs `createdBy` on the DTO), month-by-month win rate, CSV export.
