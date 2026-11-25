---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1) reminds a company with no job yet, and both reminders get a one-click stop

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#91 (merged).

**What landed.** Getting started, part 3 from the payapps ROADMAP. Companies that sign up and
never add a job used to get only the welcome email; the first-send reminder needs a real job to
exist. Now a second reminder, "Add your first job to PayApps", goes once per company from the
Monday cron, 3 to 30 days after the company was created, while it has no real job. A sample job on
its own still counts as none. It names the three ways in (a new job with its SOV from the
contractor's spreadsheet, a mid-job start from the last continuation sheet, the sample job) and
links to the Projects page.

**Why it matters to a buyer funnel.** A company with no job can never reach the paid limits
(active jobs, seats, lien waivers, QuickBooks). This is the first step of activation, and until now
nothing went to the people who stall there.

**Design choices the next run should keep.**

- The ROADMAP said a second reminder needed a one-click stop. Both reminders now carry one: a link
  to `/unsubscribe?list=onboarding` plus RFC 8058 headers that point at
  `POST /api/unsubscribe/onboarding`. The HMAC is signed over its own label, so a digest link never
  stops the reminders, or the reverse. The digest label is unchanged, so old links still work.
- A stop is a `stop:<userId>` row in `onboarding_emails`. `kind` is plain text in SQLite and the
  drizzle snapshot holds no enum, so there was no migration. That avoided a 0025 clash with the open
  pay-when-paid PR 90.
- The two reminders' states never overlap (no real job, or a job and nothing sent), so a company
  gets at most two reminders in its first two months. The privacy draft says so.

**Verified locally** (payapps CI has no runner): full `pnpm test` (unit 301, worker 206), typecheck,
biome, build.

**Next:** count which step people stall on once usage is measured, and add an account-page switch
beside the email link (ROADMAP, "Getting started, part 4").
