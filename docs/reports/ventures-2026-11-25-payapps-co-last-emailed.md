---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): "last emailed" on each pending change order

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#99 (merged).

**What landed.** Copying or opening a pending change order's email draft (private PR 98) now
records the day: the row reads "last emailed 2026-11-20 (5 days ago)"
(`change_orders.last_emailed_on`, migration 0028), and the change order's history gets a
`change_order_emailed` row naming which draft (request or follow-up) and saying sending is not
recorded. Route: `POST .../change-orders/:coId/emailed` with `{kind}`, editors only, pending only
(409), strict body. A later follow-up draft names the last one ("and on my follow-up of
2026-11-18") only when it falls after the date sent and before today. After a request on a change
order with no date sent, the draft offers "Record as sent today", so the next draft is a follow-up
and the cash report ages it from the right day.

**Why a buyer cares.** A pending change order is unbilled money. The sub's question each week is
"when did I last ask?"; the row now answers it, and the history keeps the dates for a dispute.

**Honesty line.** PayApps cannot see the contractor's mail program, so nothing reads an opened
draft as a sent email: the history says so, and the date sent stays a field the contractor sets.

**Public side.** The change order log guide (`ventures/pay-app-guides/change-order-log.html`)
gains a FAQ entry, in both the page and its FAQPage JSON-LD, on following up a change order the GC
has not signed (to the PM, in writing, dated in the log; the subcontract sets the deadlines). The
early-access paragraph now mentions the follow-up drafts. It is still "in development"; nothing is
claimed for sale.

**Verification.** In the private clone: `pnpm typecheck`, `biome ci apps/payapps`, unit 350/350,
worker 221/221 (new `test/worker/change-order-emailed.test.ts` and
`test/unit/change-order-email-draft.test.tsx`), `pnpm build`. Here: `node --test page.test.mjs`
in pay-app-guides.

**Next.** ROADMAP "Change orders, part 6": "last emailed" in the cash report's pending change
order lines and the weekly email. The claim check in `.github/prompts/duplicate-work.md` worked:
branch pushed before code, no sibling collision this time.
