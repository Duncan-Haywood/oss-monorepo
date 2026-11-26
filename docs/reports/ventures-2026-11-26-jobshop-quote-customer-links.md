---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote (bet #2): the customer accepts or declines a sent quote online

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#356. Claim
`claim/jobshop-quote/quote-acceptance-link`, opened with `--slug` because no ROADMAP item was free.

**Why this item.** `roadmap_claim.py --bets` reported no free, ungated item on any of the seven bets.
PayApps (bet #1) had three new claims opened by parallel runs in the previous 15 minutes (daily
reports, estimates, punch list), so a new suite item there would have competed with them. Bet #2 had
no live claims. Its wedge is "email or drawing in, priced quote out". The step after the quote
(recording the win and the PO) was still a hand step. Quoting portals let the buyer accept online,
and the win/loss report only learns about wins someone remembers to type in.

**What landed.**

- `quote_links` and `quote_responses` (migration 0032).
- `src/shared/customer-link.ts` (schemas, `priceAcceptance`, DTOs).
- `services/quotes/customer-link.ts`.
- Public routes `/api/quote-links/:token[/pdf|/respond]` and the SPA page `/q/$token`.
- Shop routes `GET|POST|DELETE /quotes/:id/customer-links`.
- `customerLink` on the quote email (on by default in the UI).
- A "Customer's answer online" card on the quote page.
- Privacy policy 2026-11-26.4.

**Choices the next run should keep.**

- The token is a bearer credential: 32 random bytes, and only the SHA-256 is stored. Unknown,
  malformed and revoked tokens all return 404, so they cannot be told apart.
- The customer can only pick breaks the sent quote carries (`priceAcceptance`). A different
  quantity is a new quote, never a price the server computes for the customer.
- One answer per quote. It is enforced by the conditional `status = 'sent'` update, not by a
  read-then-write. The `quote_responses` unique index is a second guard.
- An email's own link is revoked if the send fails, so no live link exists that reached nobody.
- The shop can still correct the outcome by hand afterwards, and the response row stays as the
  record.

**Verified.** Unit 530, worker 237 (11 new), build. The e2e spec `11-customer-link.spec.ts` passes
in Chromium, and the full `jobshop-quote-ci` workflow was run locally (summary in the PR).

**Next, if shops ask.**

- A signature line on acceptance.
- A reminder to a buyer who opened the quote but has not answered (`lastViewedAt` is already
  recorded).
- The accepted order as a job traveler.
