---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): email the sent quote from the app

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#132 (merged).

**Why this item.** PayApps (bet #1) had nine live claims on its ROADMAP. Bet #2's item 6 was
free. The PR #128 doc said it "needs an owner step", but it does not: the `EMAIL` binding and
the port were already in from the account-mail work. Only the real delivery waits for the
deploy (item 3). Claimed with `roadmap_claim.py jobshop-quote --claim 6`.

**What landed.** `POST /quotes/:id/email` `{ to, message }` and `GET /quotes/:id/emails`. A
`quote_emails` table (migration 0004). An "Email to customer" card on the quote page. In the
email port: attachments (base64, at most 10 MB, safe file names) and a display name per
message.

**Choices the next run should keep.**

- The attachment is the R2 object at `sent_pdf_key`, checked against `sent_pdf_sha256`. Never
  re-render at email time: what the buyer receives must equal what the shop's records hold.
- Reply-To is the signed-in estimator, and their address must be confirmed. From stays
  EMAIL_FROM's address and only the display name changes ("<shop> via Job Shop Quote"), so SPF
  and DKIM keep working.
- Only `sent` quotes can be emailed (`isEmailable` in `src/shared/quote-email.ts`). A revision is
  emailed from its own page once it is marked sent.
- Limits are counted from `quote_emails` rows, and failed attempts count too. Two concurrent
  sends at the limit can both pass, overshooting by one. This is documented in docs/EMAIL.md and
  accepted.
- Provider errors are stored with addresses replaced by `[address]`. Logs carry ids and counts
  only.
- A server without a provider answers 503. The fake sender (tests and the offline demo) records
  the send as `delivered: false`.

**Next (ROADMAP item 6, part 2):** a copy to the estimator, threading to the inbound RFQ email
(with item 8), and a shop signature block. Item 7, part 2 (the day-before-expiry email to the
estimator) can now reuse `ctx.email`.

**CI note.** Private-repo Actions jobs fail in 3 to 8 seconds and leave no logs (a 404 on
download). Merged PR #131 shows the same pattern, so runners are not being assigned. This PR
was verified locally: typecheck, 73 unit tests, the 12-file worker suite (including the 8 new
quote-email tests), the build and biome.
