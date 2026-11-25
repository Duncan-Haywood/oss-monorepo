---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): quote revisions and the daily expiry job

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#128.

**Why this item.** PayApps (bet #1) had six live claims on its ROADMAP within the last two hours.
Bet #2's ROADMAP had ten free items. Item 7 (revisions + expiry) needed no owner step, unlike
the deploy (item 3) or email sending (item 6). Claimed first with `roadmap_claim.py --claim 7`.

**What landed.** `POST /quotes/:id/revise` starts "Q-n Rev N+1" from a sent, lost or expired
quote. Its lines are copied exactly, with prices and rate snapshot. Sending the revision marks
the earlier quote `superseded` in the same D1 batch. A daily cron (`17 11 * * *`) expires sent
quotes once their valid-until day has passed. Migration 0003 is included.

**Choices the next run should keep.**

- `quotes.revision` was already the internal edit counter used for optimistic concurrency, so the
  customer-facing number is a new column, `rev_number`. Do not merge the two.
- Lines are copied with their prices, not re-priced. The revision starts from what the customer
  saw. This differs from repeat parts, which re-prices from today's card, and the difference is
  deliberate.
- The supersede statement is guarded by `exists (... status = 'sent' and sent_pdf_key = key)`.
  A send that loses its revision race then changes nothing.
- One revision per quote (unique index on `org_id, supersedes_quote_id`). Calling Revise again
  returns the existing draft, which also settles a double click.
- `expireQuotes` is the one quote query that is not org-scoped. It is a system sweep.

**Next (ROADMAP item 7, part 2):** a "what changed from Rev 1" diff, and a day-before-expiry email
to the estimator (needs item 6, sending mail).
