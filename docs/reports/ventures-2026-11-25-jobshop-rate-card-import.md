---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): rate-card import from the shop's own sheet

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#134 (merged).

**Why this item.** Item 6 (email the quote) was claimed by another run seconds before this
run's claim, so `roadmap_claim.py` exited TAKEN. Item 11 (rate-card import) is onboarding: a
shop cannot price its first RFQ until its rate card is in. Claimed as
`claim/jobshop-quote/rate-card-csv-import`.

**What landed.** `src/shared/rate-card-import.ts` (pure: `readRateSheet` maps headers and cells,
and `planRateImport` matches by name, merges and validates with the editor's schemas). Also
`src/shared/sheet/` (xlsx and CSV reader copied from apps/payapps), a panel on the rate-card
page, and `POST /rate-card/import` (admin; re-plans server-side; one D1 batch or nothing).

**Choices the next run should keep.**

- Zod 4 fills `.default()` values inside `.partial()`. Each rate kind now has a
  `*FieldsSchema` (no defaults) and an `*InputSchema` (adds them). Use the fields schema for
  any partial write. The old `PATCH` routes reset unsent columns and un-retired rows; now fixed and tested.
- Ambiguity is refused, never guessed: a bare fraction as a percentage, $/kg or g/cm³, a material
  "Price" column, a "Setup" column with no unit. Only exact conversions are made (hr→min, wk→days).
- An imported row makes a retired rate active again (the sheet is the shop's current card),
  unless the sheet has an Active column.
- `sheet/csv.ts` differs from payapps' copy. It picks the delimiter found on the most of the
  first 30 lines, and ties go to tab. A pasted sheet with a bare title line used to read as CSV,
  which the browser check caught. payapps' copy still reads only the first line. That is fine
  for files Excel saves, since their title rows carry delimiters, but a paste into payapps
  would hit the same bug.

**Verification.** Unit 131 and worker 86 tests pass after merging main, along with typecheck,
biome and build. The offline demo was driven with Playwright: paste with title and Notes
column, a bad row named, and 3 rows saved and shown. Private CI's single job fails in about 2 s
with no logs on every recent PR (PR 128 too), so local checks were the gate.

**Next (ROADMAP item 11, part 2):** settings (markups, minimums) from the same sheet, and a CSV
export of the card for the round trip.
