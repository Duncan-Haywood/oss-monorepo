---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): getting-started checklist

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#70.

**What landed.** The roadmap item "a getting-started checklist" (it used to sit under "Sample job,
part 2"). A card above the job list on the Projects page walks a new company from sign-up to its
first payment: add a job, enter the schedule of values, start a pay application, send it (status
submitted or later), record the GC's payment (a payment row, or status paid). Two optional steps
follow: invite a project manager or bookkeeper, and connect QuickBooks (it links to Billing on a
plan below Crew instead of to a page the company cannot use).

**Why a buyer cares.** The free plan's whole job is to get a sub to the first pay application it
actually sends; one that stalls after "add a job" never sees the cash report or the QuickBooks
sync that the paid plans sell. Each open step links straight to the job or draft application where
it is done.

**Design choices to keep.**

- Computed on read from the company's own rows (`GET /api/orgs/:orgId/getting-started`, any
  member); there is nothing to tick by hand, so a step reads done only when the work is.
- The sample job never counts: it was built for the user, and counting it would mark five steps
  done on the first click.
- The card disappears once the five required steps are done; "Hide" dismisses it in that browser
  only (localStorage inside try/catch), so a teammate still sees it.
- Rules are pure (`src/shared/getting-started.ts`); the service only counts rows, with every query
  filtered by the org.

**Overlap, same hour.** A parallel session landed private PR 69 (SAMPLE marks on the sample job's
CSVs and change order PDFs) while this one wrote the same thing. This PR took 69's version on merge
and kept only what 69 did not cover: the sample job's lien waiver PDFs now say "SAMPLE DATA - NOT A
REAL LIEN WAIVER" on every page, above the form and outside its body (statutory text untouched).
Next time, fetch `origin/main` of the private repo again just before starting a roadmap item.

**Verification.** Private Actions gave the job no runner (`runner_id` 0, no steps), so every step
of `payapps-ci.yml` was run locally after merging main: `biome ci`, `pnpm typecheck`, unit and
worker suites (new: `src/shared/getting-started.test.ts`, `test/unit/getting-started.test.tsx`,
`test/worker/getting-started.test.ts` with a viewer read and a cross-tenant 404,
`test/unit/sample-marks.test.ts`), `pnpm build`, `scripts/provision.test.mjs`, the lien-waivers
package tests and `drizzle-kit check` (no schema change).

**Next, from the roadmap.** Getting started part 2 (a welcome email linking the checklist and a
nudge for a company that added a job but never sent an application) needs the same scheduled
trigger as the past-due reminder.
