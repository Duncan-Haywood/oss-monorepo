---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): fill a mid-job opening balance from the last continuation sheet

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#71 (merged).

**What landed.** Roadmap item "Mid-job start, part 2". A sub moving a running job to PayApps used to
type the last application's work completed to date line by line. The opening-balance form now has
"Fill from your last continuation sheet": the .xlsx or CSV of the last application sent elsewhere is
read in the browser (never uploaded) and fills the form for the contractor to check and save.

**Why a buyer cares.** Almost every first customer is mid-job on several jobs. Re-keying a 40-line
G703 per job before the first pay app is the switching cost most likely to stop a trial.

**How it works (keep these choices).**

- The SOV import's reader (`src/shared/sov-import/schedule.ts`) now also returns each row's D, E, F,
  G and retainage columns, the change-order rows it skips for an SOV import, and the application
  number and period end from the title block (ISO, US or Excel-serial dates).
- The pure matcher `src/shared/sov-import/opening.ts` maps sheet rows to job lines by item number,
  then by description, and only one-to-one. Ambiguous or unmatched rows with work are listed with
  their cell, never guessed.
- Work completed = D + E (else G less F): stored materials are never carried, matching the form's
  existing rule. Line 6 = G less retainage over every row. Line 5a is filled only when nothing is
  stored, because a G703 retainage column covers stored materials too.
- Also flagged: unreadable cells, work above a line's value, differing values or descriptions, and
  D + E + F not equal to G.

**Verification.** Private CI got no runner (fails in 2 s), so `payapps-ci.yml`'s steps were run
locally: typecheck, unit 226/226 (7 new), worker 159/159, build, biome (one older warning),
provision test, drizzle drift check. Playwright against `pnpm dev` uploaded
`test/fixtures/libreoffice-g703.xlsx` into a job with its lines. The form filled app #7, line 6
$125,212.72 and per-line D + E; after a date was entered and the form saved, the API returned the
same figures.

**Next.** Part 3 is in the payapps ROADMAP: per-line retainage released before the move, reading
5a/5b from a G702 summary sheet in the same workbook, and placing an unmatched row on a line
straight from the fill report.
