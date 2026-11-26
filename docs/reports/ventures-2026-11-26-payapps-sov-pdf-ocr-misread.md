---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): a scan's misread amount is pointed at, not just counted

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#201. ROADMAP Next #3,
"SOV import from a PDF, part 4" (the misread half); claim `claim/payapps/sov-pdf-ocr-misread`.

**What landed.**
- `apps/payapps/src/shared/sov-import/misread.ts` (pure): `lookAlikes(cents)` lists every amount a
  figure could be with one digit swapped for a look-alike (same digit count, never a leading 0);
  `misreadsAgainstTotal` names the lines (or the totals row) whose swap makes the lines meet the
  sheet's own total within the total check's slack; `misreadsInRow` does the same for one
  continuation-sheet row's D + E + F = G.
- `sov-import/pdf.ts`, scans only: `totalMisreadCheck` adds a second "high" check beside the existing
  "the sheet's own total is..." one, naming 1-3 suspects ("2 Drywall hang and tape (page 1, line 3)
  reads $8,500.00; $3,500.00 if an 8 there is a 3 on the paper"). More than 3 suspects: none named.
- `sov-import/opening.ts`: on a scanned continuation sheet the "columns disagree" check names the
  cell(s) per row. `SovImportOk` gains optional `scanned` and `sheetTotalSource`.
- Nothing is ever corrected; printed PDFs and spreadsheets read exactly as before.

**What the next run should know.**
- The look-alike table is our own judgment of glyph shapes, not a measured Tesseract confusion
  matrix. `0` and `8` have broad look-alike sets, so a round gap ($50, $500) can fit several lines:
  that is why the cap is 3. If a run gets real misread scans, measure the confusions and narrow the
  table.
- Neither Tesseract fixture misreads an amount, so the pointer is tested on hand-built scans
  (`scan.test.ts`) and CSV-built sheets (`misread.test.ts`) only.
- A row check names both D/E and G when either swap fits (e.g. E 8,125.25 vs G 33,125.25): reading the
  balance-to-finish (H) and % columns would pin it to one cell; that is the ROADMAP's remaining part 4
  item, beside OCR for scans with no text layer.

**Verification.** `pnpm typecheck` clean; `pnpm test:unit` 60 files / 561 tests; CI runners starved
(job never got a runner), so `run_workflow_locally.py payapps-ci` was run here (result in the run record).
