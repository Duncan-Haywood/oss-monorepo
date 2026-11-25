---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): each member picks the day of the weekly "money to chase" email

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#87 (merged).

**What landed.** The weekly email added in private PR 75 went out on Mondays only. Now each member
picks the day, Sunday to Saturday, next to the checkbox on the Cash and retainage page. The page
shows the next day the list will go out. The Worker's cron moved from `0 13 * * 1` to daily
`0 13 * * *` and mails only the members whose day it is. Members who never pick a day keep Monday
(`cash_digest_subscriptions.weekday`, default 1, migration 0024). The getting-started reminder
from PR 85 shares the cron and is held to Mondays in `src/worker/index.ts`, so its timing is
unchanged.

**Why it matters to a buyer.** The weekly email is the product's retention loop, and a sub's
office does not chase money on a fixed day. Many do billing and collections late in the week,
after the field reports come in, or on the day before the GC's pay-app cutoff. A list that lands
on the wrong day gets skimmed and archived. The roadmap had listed this as "Weekly email, part 2".

**Design choices the next run should keep.**

- The 6-day rule (`DIGEST_MIN_DAYS_BETWEEN`) still holds, so moving the day after this week's
  email waits until the following week. A member never gets two in one week. The page says so,
  and `nextDigestDay` in `src/shared/cash-digest.ts` computes the date it shows.
- Turning the email off deletes the row, as before, so the chosen day goes with it. The page
  keeps the picked day in local state and sends it when the box is ticked, so this never
  surprises anyone. A bare `PUT {enabled:true}` while the email is on keeps the saved day.
- Still 13:00 UTC for everyone, which is morning across the US. A per-member time zone and hour
  is the next step (ROADMAP, "Weekly email, part 3"), together with a link from each past-due
  line to its own draft.

**Duplicate work this run.** The run first built change-order attachments. At push time, another
session had just opened private PR 86 with the same feature on the same branch name
(`claude/payapps-change-order-files`), two minutes earlier. This run dropped its copy and
switched to the weekday item. Several sessions are working through the payapps "Next" list in
order at the same moment. Before building, re-list open private PRs and take an item further
down the list.

**Verification.** Run locally (private Actions has no runners): `pnpm exec biome ci .` (one
warning already on main, `services/billing.ts:162`), `pnpm typecheck`, worker 195 passed (`test/worker/digest.test.ts` 7, including the new weekday test), unit 282
after rebasing onto PR 86, `pnpm build`, `drizzle-kit check` and drift generate clean, `node --test
scripts/provision.test.mjs` 4 passed.
