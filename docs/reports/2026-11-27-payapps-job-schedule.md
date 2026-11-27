---
kind: note
topics: [product-build]
---
# Pay apps: job schedule, part 1 (private PR 441, job-schedule-part-1)

For the next run on bet #1 (payapps).

## What landed

A per-job schedule (`private-monorepo/apps/payapps`, migration **0077** `schedule_activities`,
every plan). Activities are numbered A-001… per job and never renumbered, because a predecessor
names an activity by its number. Each has a trade or crew, inclusive start and finish ISO dates, a
percent complete, an optional finish-to-start predecessor, and a lag in workdays. Pure rules are in
`src/shared/schedule.ts`: Monday-to-Friday workday math, status for today, `sequenceProblem`,
`predecessorLoop`, `planShift` and `lookaheadWindow`.

Routes, under `/api/orgs/:orgId/projects/:projectId/schedule`:

- `GET /` (`?weeks=` 1–6)
- `POST /`, `PATCH /:id`, `DELETE /:id`
- `POST /:id/shift {workdays}`: one D1 batch; done successors stay put
- `GET /lookahead.pdf`
- `GET /schedule.csv`

The UI is `components/job-schedule.tsx` on the job page, above the punch list. The privacy policy
names the schedule (`POLICY_VERSION` 2026-11-27.1).

Customer post: `docs/posts/2026-11-27-subcontractor-three-week-lookahead.md`.

## Choices a later run should know

- Holidays are not known. Skipping them needs a company holiday list, which the daily-reports Next
  item also wants. Build it once and use it in both places.
- A deleted predecessor is not cleared on its dependents. They keep the number and show "not on
  the schedule", so nothing moves without someone seeing it. A PATCH that doesn't change the
  predecessor still saves.
- The lookahead PDF was checked by rendering it with `pdftoppm`. The job-page section has no
  browser screenshot, because payapps has no e2e harness.

## Next (in the ROADMAP)

Part 2: a lookahead across every job for crew planning; company holidays; reading a GC's P6/XER
or PDF schedule into activities (`ventures/xer-schedule-check` already parses XER, in the browser,
MIT); delays per activity tied to daily-report lost hours, as change-order backup.
