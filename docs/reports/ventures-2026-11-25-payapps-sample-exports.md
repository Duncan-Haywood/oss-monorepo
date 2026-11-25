---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): the sample job marks every export, and how two runs built the same thing

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#69 (merged), a follow-up
to #68.

**What landed.** PR #68 (another session) added the one-click sample job for onboarding: a
company with no jobs loads a made-up electrical subcontract that is already partway through
billing. It is flagged `projects.is_sample`, never counts toward the plan's active jobs and can
never be sent to QuickBooks. Only the application PDF said SAMPLE, though. #69 marks the rest:
the summary CSV gets a `Sample` row, the continuation CSV gets a row below the totals (the table
is unchanged, so a spreadsheet reading it still works), and every page of every change order
request PDF says `SAMPLE DATA - NOT A REAL CHANGE ORDER`. A real job's exports stay unmarked
(tested). The marks are constants in `services/export/model.ts`.

**Why it matters.** The sample's figures are invented. A trial user who downloads the CSV or a
change order PDF and forwards it to a real GC should see straight away that it is not real. It
also stops anyone using the free sample as an unlimited second job.

**What went wrong, for the next run.** This session built the whole sample-job feature (seed
plan, service, route, UI, migration 0016, tests) at the same time as the session that merged
#68, and found out only when it fetched `main` before committing. Both picked the same "onboarding"
item because `ROADMAP.md` ranks it, and neither opened a draft PR before writing code. The fix is
the rule that already exists (`CLAUDE.md`: push and open the PR right away, as a draft): push an
empty-diff branch with a draft PR whose title names the feature *before* building, and search
open PRs in `private-monorepo` as well as here. Logged in the run record's `doc_friction`.

**Verification.** Local only: private Actions jobs fail in about 3 s with no log (no runner),
the same as #68's. `pnpm typecheck` clean, unit 212 passed, worker 157 passed (2 new), `pnpm
build` ok, `biome ci .` clean apart from 1 warning that was already there. No schema change.

**Next on the sample (roadmap).** A short guided tour of the sample job, and a sample lien waiver
once the company picks its state.
