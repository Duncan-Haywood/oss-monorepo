---
kind: note
date: 2026-11-25
tagged: auto
---
# CMMC Workspace: ISO 9001:2015 clause checklist on the same evidence (private PR 164)

Bet #4 (`portfolio/monetization/bets.md`, "CMMC L1/L2 + ISO 9001 workspace"). The ROADMAP item in
`private-monorepo/apps/cmmc` was "ISO 9001 / AS9100 clause checklist on the same evidence". It merged
as private PR 164 on 2026-11-25. Claim branch: `claim/cmmc/iso-9001-as9100-clause-checklist-on-the-same`.

## What landed
- `src/shared/quality/iso9001.ts`: the 47 requirement clauses of ISO 9001:2015 (4.1 to 10.3), as
  numbers and headings plus our own "what shops usually keep" prompts. **No ISO requirement text**,
  because the standard is copyrighted (this is unlike the NIST/CFR text in the CMMC library, which
  is public domain).
- `relatedControls` lists CMMC requirements whose files usually serve the clause too (7.2 ↔
  AT.L2-3.2.2, 9.2 ↔ CA.L2-3.12.1, 10.2 ↔ CA.L2-3.12.2, 8.5.3 ↔ MP.L2-3.8.1 / AC.L2-3.1.3, and
  others). Files on those requirements show under the clause automatically, and any file can be
  linked (`quality_evidence_link`, migration 0004).
- Readiness by section, a list of clauses marked "in place" with no file, a Markdown gap report,
  and "not applicable" refused without a reason.
- The plan gate is `plan.quality`. The $399 plan is renamed **Level 2 + Quality**; its key stays
  `team`, so the Paddle catalog id is unchanged. Every plan can read the checklist.

## For the next run
- **Headings not checked against a copy.** This session's proxy refused every outside host
  (wikipedia, iso.org, ecfr.gov), so `ISO9001_VERIFICATION.checkedAgainstCopy` is `false` and the
  UI says so. A session that can reach ISO's Online Browsing Platform contents preview should
  compare all 47 headings and flip the flag. See ROADMAP "ISO 9001, part 2".
- AS9100D's additions need an SAE source first. Don't write them from memory.
- Private-monorepo CI still fails within seconds on every PR (163 and 164 too), before any step
  runs. Verify locally with biome ci, typecheck, test:unit, test:worker, build and the drizzle-kit
  drift check. All passed here (unit 203, worker 49).
- `pnpm install --filter cmmc` matches nothing; the package name is `cmmc-workspace`. The dev
  server must run on port 5173 (`APP_URL`), or sign-up fails with "Invalid origin".

## Follow-up: clause owners and a dashboard card (private PR 171)
- Owner picker on each clause (members only; `isMember` refuses others); `QualityReadiness.openWithoutOwner`
  lists gaps and partly-in-place clauses with no owner; the gap report has an Owner column (names
  from `listMembers` of this org only); `Dashboard.tsx` has an `IsoCard` (figures on Level 2 +
  Quality, a pointer on other plans). No migration: `owner_user_id` was already in 0004.
- Private CI fails in 3 s with no log on this and earlier PRs (166 too): runners are not starting.
  Verify locally (`pnpm typecheck`, `test:unit`, `test:worker`, `build`) and say so in the PR.
- Next on this item: the "mine" filter on the clause list, the headings check against a copy, AS9100D.

