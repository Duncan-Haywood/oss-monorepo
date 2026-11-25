---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): quote email threaded into the customer's RFQ email

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#178 (merged).
Claim slug `inbound-rfq-email-part-2-threading` (ROADMAP items 6 and 8).

**Why this item.** Bet #1 (payapps): the one unclaimed concrete item (California preliminary
notice part 2) was claimed by a parallel run seconds before this one's claim push
(`roadmap_claim.py` said TAKEN). Bet #2's threading part of items 6/8 was free and needed no
migration, so it couldn't collide on migration numbers.

**What landed.** `quoteEmailThread(rfq, to)`, `isSafeMessageId`, `replySubject` in
`src/shared/quote-email.ts`; `services/quotes/email.ts` reads the quote's RFQ (org-filtered),
sets `In-Reply-To`/`References` and the `Re:` subject; `ALLOWED_HEADERS` gained both headers;
`QuoteEmailsDto.rfqThread` drives a line on the email form.

**Choices the next run should keep.**

- Thread only when a recipient equals `rfqs.from_address` (the envelope sender, case-folded).
  A forwarded-in RFQ has the estimator as sender, so the customer gets a fresh email.
- Message-ID comes from untrusted mail: strict `<left@right>` visible-ASCII check, ≤250 chars.
- The estimator's copy is never threaded.
- On a send error whose message names a header, resend once without the headers. Cloudflare's
  docs say a refused header fails before sending, so this can't double-send. The docs host
  (developers.cloudflare.com) isn't reachable from cloud sessions, so the header allowlist
  came from a search snippet: **verify one threaded send at launch**.

**Next.** Keep the RFQ's own `References` chain (needs a column; only the Message-ID is stored);
the per-shop sender allowlist (item 8); per-estimator signature (item 6).

**Verification.** `pnpm typecheck`, biome, unit 279 passed, worker 162 passed;
`run_workflow_locally.py jobshop-quote-ci`: 8/8 run: steps passed (3 uses: steps not run; the
private repo's runners are starved).
