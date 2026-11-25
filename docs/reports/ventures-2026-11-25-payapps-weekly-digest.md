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

## Update: a link from each application to its own draft (private PR 105)

Later the same day (Duncan-Haywood/private-monorepo#105). The email already said "N follow-up
drafts are waiting" with one link to the whole list. Now, under each listed job, every past-due or
paid-short application has its own line, "Draft email for application #3 (second request)",
linking `/orgs/:orgId/cash#follow-up-<payAppId>`. The cash page opens that draft and scrolls to it.

**Why.** The email is where a busy sub decides to act; one click from "#3 is 45 days late" to a
written, addressed reminder removes the step where people drop off (find the job, find the
application, open the draft).

**Choices the next run should keep.**

- The draft list per job comes from the same `followUpKind` rule as the cash page, so the email
  never links a draft the page would not offer. Capped jobs keep only the count line.
- A link that outlives its email is handled: an application no longer past due is still shown
  (the "not yet due" list opens), and one paid since says so instead of opening nothing.
- The anchor is `follow-up-` plus the URL-encoded id, HTML-escaped in the email; the page only
  compares the decoded hash with its own ids.

**Verification.** Local: `pnpm typecheck` clean, unit 362 passed, worker `digest.test.ts` 7
passed (full worker suite in the run record), biome clean on the touched files.
