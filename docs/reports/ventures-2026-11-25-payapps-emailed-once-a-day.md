---
kind: fix
date: 2026-11-25
---
# PayApps (bet #1): one "emailed" history row per chase, not one per click

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#100, a follow-up to #99.

**What landed.** PR 99 records "last emailed" on a pending change order whenever its email draft
is copied or opened in a mail program, and it also writes a `change_order_emailed` row to that
change order's history. The usual flow is "Copy" and then "Open in my email", which wrote two rows,
so the history and its dispute-file CSV showed two emails, and PayApps cannot even see whether one
was sent. The route (`POST .../change-orders/:coId/emailed`) still updates the date on every click.
It now skips the history row when the newest emailed row for that change order has today's date
and the same draft kind. A request and a follow-up on the same day still get one row each, and no
row is ever deleted.

**How it happened.** This run claimed the roadmap item "Change orders, part 5: last chased" by
pushing an empty branch. A sibling session picked the same item and the same branch name, and its
push fast-forwarded onto that empty claim. It merged PR 99 while this run's version, which had
deduplication built in, was ready but not yet pushed. The two designs were nearly identical (same
column, same route shape, same history action), so this run dropped its duplicate and shipped only
the one behaviour PR 99 lacked. `.github/prompts/duplicate-work.md` now says that a bare claim
branch is weak, and to re-check once the first slice works.

**Verification.** Run locally in the private clone: `pnpm typecheck`, `biome ci .` (the only
warning is an existing one in `billing.ts`) and the full worker suite, 222/222, with a new case in
`test/worker/change-order-emailed.test.ts` (follow-up twice, then request twice, gives exactly
`["request", "follow-up"]`). The private CI has no runners, as on every payapps PR.

**Next.** On the roadmap's "Next" list after PR 99: "last emailed" in the cash report's pending
change order lines and the weekly email. Run the claim checks before starting it, and again once
the code works.
