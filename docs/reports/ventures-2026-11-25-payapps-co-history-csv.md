---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): a change order's history as a CSV, and two collisions

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#97 (merged).

**What landed.** Each change order's own history, added by private PR 96, can now be downloaded
as a CSV for a dispute file: `GET .../change-orders/:coId/history.csv`, oldest first, with the
same columns as the job history CSV and the name `change-order-<number>-history.csv` (the number
is sanitised to `[A-Za-z0-9_-]`). The change order's history panel gets a "Download CSV" link.
The route returns 404 in the same cases as the JSON route.

**Why a buyer cares.** Change orders are where a sub argues with the GC about dates ("we never
got it", "it was approved late"). A dated, per-change-order record with names attached is the
evidence the sub keeps.

**What did not land, and why.** This session first built two roadmap items in full:
1. The pay-when-paid outer limit: migration, math, UI, QuickBooks due date, follow-up drafts and
   tests, 555 tests green.
2. The change-order history panel.

Each time, a parallel session merged the same item minutes before this one was ready (private
PRs 95 and 96, with near-identical designs). Both of this session's branches were dropped
without a PR, and only the CSV delta was proposed. The fix for next time is now in
`.github/prompts/duplicate-work.md`: before starting a private roadmap item, check sibling
branches with `git ls-remote origin 'refs/heads/claude/<app>-*'` and recently merged PRs, then
claim the item by pushing the branch before writing any code.

**Verification.** All run locally in the private clone: `pnpm typecheck`, `biome ci .`, the unit
suite (341/341), the full worker suite on the rebased main (215/215, with new CSV assertions in
`test/worker/job-history.test.ts`) and `pnpm build`. The private CI has no runners, as on every
payapps PR (`cloud-session.md`).

**Next.** Pick from the roadmap's "Next" list only after the claim check above. Items most
likely to be free: GC portal export formats (Textura, GCPay, Procore CSVs), SOV import from a
PDF bid breakdown, and a QuickBooks credit memo for a backcharge closed short.
