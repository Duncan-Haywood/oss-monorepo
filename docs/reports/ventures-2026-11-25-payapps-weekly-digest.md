---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1) emails each member a weekly list of money to chase

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#75 (merged).

**What landed.** PayApps' first scheduled job. Any member of a company can turn on, for
themselves, a Monday email (cron `0 13 * * 1`) carrying the cash report's next steps:
applications past due or paid short, retainage to bill on finished work, unconditional lien
waivers owed, change orders waiting past 30 days for approval, disputed balances. A checkbox and a
preview count sit on the Cash and retainage page (`GET/PUT /api/orgs/:orgId/digest`, table
`cash_digest_subscriptions`, migration 0018).

**Why it matters to a buyer.** The cash report is only useful if someone opens it. Subs lose money
by forgetting to chase: a GC 20 days late, a retainage bill nobody sent, the unconditional waiver
that holds up the next check. A weekly push is the retention loop the product lacked, and it
closes three roadmap items that all said "needs the scheduled trigger" (past-due reminder, waiver
reminder, change-order reminder). The same cron can now carry the "added a job but never sent an
application" nudge.

**Design choices the next run should keep.**

- The email says nothing the report does not: its lines are the report's own `actions`
  (`src/shared/cash-digest.ts`), so there is one source of truth for wording and math.
- No email in a week with nothing to chase (the week still counts), never the sample job, only to
  verified addresses of current members, fixed subject (customer text stays in the escaped body).
- Exactly once a week per member: each send is claimed by a conditional update of `last_sent_on`;
  a failed send restores it.
- Not yet: one-click unsubscribe (the email port has no custom headers; turning it off needs a
  sign-in today), a choice of weekday, a draft follow-up email to the GC.

**Privacy policy.** `docs/legal/privacy.md` now lists the opt-in weekly email among the account
emails. `POLICY_VERSION` was not bumped: it is opt-in and adds no data or subprocessor.

**Verification.** Local (private Actions has no runners; its one check failed in 2 s with no
steps): `pnpm typecheck` clean, unit 237 passed (244 after merging main), worker 171 passed (new
`test/worker/digest.test.ts`, 5 tests), `pnpm build` ok, `drizzle-kit check` fine. `biome check
apps/payapps` reports one error already on main (`services/billing.ts:162`).
