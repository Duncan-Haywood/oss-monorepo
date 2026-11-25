---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): one owner's payment date on several pay applications at once

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#102 (merged).

**What landed.** On a pay-when-paid job (terms count from the day the owner pays the GC), the
job page now has an "Owner's payment for several applications" panel. It lists the job's sent
applications, ticks the ones still waiting (no owner-payment date yet and money still owed), and
records one date on every ticked one with
`PUT /api/orgs/:orgId/projects/:projectId/pay-apps/owner-paid` (`payAppIds`, `ownerPaidOn`;
editors; up to 50). It is all or nothing: each application must pass the existing
one-application rule (sent, not before its period began, not in the future, job still on
pay-when-paid terms), and the first refusal names its application number. Each application whose
date changed gets its own history row naming the others ("recorded as 2026-03-05, together with
applications #1 and #3"); sending the same date again writes nothing. Clearing a date stays on
the application's own page.

**Why a buyer cares.** On pay-when-paid subcontracts the GC often reports one owner draw that
covered two or three months. Before this, the sub had to open each application and type the same
date; now it is one step, and the history shows the dates were recorded together, which is the
record a sub wants if a GC later disputes when the money came in.

**Collision check.** Before writing code the branch was pushed as a claim
(`.github/prompts/duplicate-work.md`), after `git ls-remote` showed no sibling branch for the
item and the last ten private PRs (up to #99) touched other items. Re-checked before the PR:
private main had gained #100 (change-order "emailed" history rows) and #101 (jobshop-quote
billing), neither touching these files.

**Verification.** In the private clone: `pnpm typecheck`, `biome ci apps/payapps` (one pre-existing
warning in billing), unit 359/359, worker 224/224 and `pnpm build`; after merging private main
(#100, #101), typecheck and the affected worker tests again. New tests: rule
tests for `ownerPaidManyProblem` and the history sentence, a worker test
(`test/worker/owner-paid-many.test.ts`: cash-report due dates from the shared date, history rows,
all-or-nothing refusals, duplicate and empty lists, unknown and other-org ids, viewer 403,
cross-tenant 404) and a component test of the panel's selection and request body.

**Next.** Roadmap "Next" items most likely free: a backcharge closed short sent to QuickBooks as
a credit memo, GC portal export formats, SOV import from a PDF bid breakdown. Claim first.
