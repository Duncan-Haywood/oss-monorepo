---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): the weekly email links to the follow-up drafts; late-payment email templates on the public guide

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo, branch
`claude/payapps-digest-follow-up-link` (number in the run record). Public side: three follow-up
email drafts on `ventures/pay-app-guides/prompt-payment-laws.html`.

**Collision, and what survived it.** This run built "GC billing contact on each job, follow-up
drafts addressed to it" in parallel with another session, which merged it first as private PR 80
(one minute ahead of this run's push, same branch name). This run dropped its own copy of that
feature and rebuilt on main with only what PR 80 lacked:

- The **weekly "money to chase" email** now counts the unpaid applications with a follow-up draft
  waiting (past due or paid short, across every job, including jobs cut by the 15-job cap;
  `CashDigest.followUps`, `digestFollowUpText` in `src/shared/cash-digest.ts`) and links to
  `/orgs/:orgId/cash#follow-ups`, in text and HTML. The cash page scrolls to the drafts on that
  hash once the report has loaded (the browser's own jump fires before the async report exists).
- The **privacy draft** (`docs/legal/privacy.md`) lists the GC billing contact's name and email
  among job data, which PR 80 had not added. `POLICY_VERSION` not bumped: unlaunched, no new
  subprocessor, PayApps never mails that address.

For the next run: before building a ROADMAP "Next" item, list the private repo's branches with
`git ls-remote origin 'refs/heads/claude/payapps-*'` as well as open PRs. PR 80's branch had no PR
when this run checked, and was merged minutes later.

**Why it matters to a buyer.** The Monday email told people what to chase but not that the emails
to the GC were already written. Now it is one click from the email to an addressed draft.

**Public side.** `prompt-payment-laws.html` (pay-app-guides, bet #1's front door, ranked for "GC
paying late" searches) gains "Follow-up emails to send a GC about a late pay application":
reminder, second request and paid-short templates in the product's own wording, with links to the
paid-short reconciler and cash forecast and a not-legal-advice note. `llms.txt` updated.

**Next (ROADMAP.md).** A link from each past-due line in the weekly email to its own draft; a
choice of weekday; the contact as the QuickBooks invoice's BillEmail (PR 80's note).
