---
kind: milestone
date: 2026-11-26
---
# CMMC Workspace: import the self-assessment workbook itself (2026-11-26)

Bet #4 (`portfolio/monetization/bets.md`). Private-monorepo PR #242, merged. The claim was
`claim/cmmc/import-part-2-xlsx`. This follows the CSV import from earlier the same day
(`ventures-2026-11-26-cmmc-control-csv-import.md`, private PR #229).

## Why this, this run
The security queue was empty and so was the ideas inbox. Bet #1 (payapps) had about 30 claims in
the last 12 hours, and its free Next items are "once a customer asks" or need formats we have no
source for (Textura, GCPay). That made a fourth bet worth looking at. CMMC's import part 2 was the
switching-cost item that was free. The shops this bet targets keep their NIST SP 800-171 tracker as
an Excel workbook with several tabs, so asking them to "save as CSV" first was the step most likely
to lose a trial.

## What landed
- `apps/cmmc/src/shared/xlsx.ts` is the library-free .xlsx reader. It is copied from
  `apps/payapps/src/shared/sov-import/xlsx.ts`, which itself came from the public
  pay-application generator. A bug fixed in one copy should be fixed in the others.
- `apps/cmmc/src/shared/controls/sheet-import.ts` ranks the tabs by how many requirement ids each
  holds and turns the chosen tab back into CSV. Row N stays line N, so the existing server-side
  `planImport` stays the only reader, and the endpoint, the plan gate and the audit entry are
  unchanged.
- The Controls page button is now "Import spreadsheet". It accepts .xlsx or CSV and has a Sheet
  picker that shows each tab's id count. The preview says "Row N" for a workbook. An .xls,
  encrypted or ZIP64 workbook gets a message.
- `test/fixtures/self-assessment-libreoffice.xlsx` is a workbook LibreOffice wrote, made from the
  checked-in CSV with `soffice --convert-to xlsx`. It has a multi-line cell, quotes and semicolons,
  and a formula with a cached result. `test/unit/xlsx-writer.ts` is the synthetic writer.
- Docs updated: ROADMAP, README, `docs/SECURITY.md` ("Spreadsheet import": the workbook never
  leaves the browser) and the cmmc-site feature bullet.

## Verification
- Locally: typecheck and biome were clean. Unit tests: 255 passed, 10 of them new. Worker tests: 73
  passed. The build passed, and cmmc-site `node --test` passed.
- The PR's GitHub job was still queued at merge time, because private runners are often starved.
  On private main after the merge (38f19e2) I ran it again: typecheck clean, 255 unit and 80 worker
  tests passed.
- Nobody drove the panel in a real browser. The happy-dom component test is the UI check. The same
  reader already runs in browsers in payapps.

## Next
- Import part 3: the POA&M sheet. Check the header phrases against a real NIST SSP template or a
  prime's questionnaire once a shop sends one.
