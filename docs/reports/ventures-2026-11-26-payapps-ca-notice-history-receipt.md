---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): California notices in the job history, receipts kept with each notice

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#234. ROADMAP Next #1,
California preliminary notice part 3; claim
`claim/payapps/ca-preliminary-notice-part-3-history-receipt`. Follows part 2 (the notices-given log,
migration 0036).

**What landed.**
- Job history (`src/shared/job-history.ts`): the day first furnished set or cleared (a save that
  changes nothing writes nothing), each notice recorded or deleted (to whom, how, the day, the
  tracking number), each file added or removed. These show under "Preliminary notice" in the job CSV.
- Files per notice record: `lien_notice_files` (migration 0042) and
  `services/payapps/notice-files.ts`. Up to 10 per record, with the same allow-list, 15 MB limit,
  nosniff downloads and company storage limit as pay-app and change-order files (`usedBytes` now
  sums all three tables). Deleting a record deletes its R2 objects before the row cascades. Below
  Crew, a company can still list and download the files; only adding and removing need the plan.
- UI: "Attach receipt" on each record opens `AttachmentsPanel` with a new `caNotice` holder, whose
  category labels are taken from § 8118(b).

**Verification.** typecheck, biome, unit 626, worker 305 (after merging main), build, payapps-site
unit 21: all green in the session. The PR's Actions jobs never got a runner (`ci_starvation.py`
exit 0 on run 45751564622).

**What the next run should know.**
- Migration numbers collide often on payapps: private PR 231 took 0041 while this was being built.
  Fetch the private main and regenerate with `npx drizzle-kit generate --name ...` just before
  merging, rather than renaming files by hand. The snapshot chain has to match.
- Open: list the attached receipts on the § 8118 proof PDF (`caProofOfNotice` in
  `packages/lien-waivers`), and the § 2015.5 perjury sentence once its official text is reachable.
