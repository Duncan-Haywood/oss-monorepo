---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1) emails new companies the way to their first paid application

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#85 (merged; "Getting started,
part 2" on the PayApps roadmap).

**Why this slice.** PayApps has a paid tier, a dark checkout and a getting-started checklist on
the Projects page. A checklist only helps someone who comes back to the page. The step people stall
on in pay-app tools is the first application sent, because that is when the software starts paying
for itself. Two emails now cover that gap.

**What landed.**

- **Welcome email.** It goes when a verified user creates their *first* company, not a second one,
  and is sent from `POST /api/orgs` without ever failing that request. It lists the five required
  checklist steps (with the same wording the page uses, generated from
  `src/shared/getting-started.ts`), the sample job, the mid-job start for a job already billed
  elsewhere, and a link to the checklist.
- **One first-send reminder.** It runs from the Monday cron, independently of the weekly digest.
  It goes once per company, 5 to 60 days after the company was created, when the company has a real
  job (the sample never counts) and no application marked sent. It says what is done and names the
  next open step, linking straight to the job or the draft where that step is done. On a started
  draft it says to mark the application submitted so the cash report can age it. It goes to owners
  with a verified address only and says it is the only reminder.
- **Once only, retried on failure.** Each email is claimed with a row in `onboarding_emails`
  (migration 0022, primary key company + kind). A failed send deletes the claim, so a later run
  retries. A company that is checked but not due is not claimed, so the cron looks again next week.
- **Docs.** The privacy draft now names both emails. `docs/EMAIL.md` has a "Getting-started emails"
  section.

**Verification.** All run locally because private-repo CI dies in about 3 s with no logs, the same
way on PR 84: typecheck clean, `biome ci` (only a warning already on main), unit 277/277,
worker 186/186 (new `test/worker/onboarding.test.ts`, `src/shared/onboarding-email.test.ts`), build,
provision tests, and the drizzle migration drift check.

**Next for the next run** (PayApps ROADMAP, "Getting started, part 3"):
- A reminder for a company that signed up but never added a job. That would be a second email, so
  it needs a one-click stop like the weekly digest's.
- Measuring which step people stall on, once usage is measured.
