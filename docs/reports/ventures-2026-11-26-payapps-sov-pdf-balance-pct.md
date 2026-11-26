---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): the H and % columns pin a scan's misread to one cell

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#204. ROADMAP Next #3,
"SOV import from a PDF, part 4" (the H/% half); claim `claim/payapps/sov-pdf-balance-pct`.

**What landed.**
- `sov-import/schedule.ts`: `ImportedBilling` gains optional `balanceCents` (H) and `percent`
  (`PrintedPercent`: digits, decimals, % sign; `readPercent`). They are read only when the header
  has the column. A blank or text cell gives null and is never added to `errors`.
- `sov-import/misread.ts`: `RowFigures`, `rowGaps` ("sum", "balance") and `misreadsInRow`, which now
  also tries C and H and keeps only a swap after which every relation the row has holds. The %
  check passes when G / C is within one unit of the printed %'s last digit (a bare "0.45" also counts
  as a fraction). `scheduledAgrees` is used by the totals pointer.
- `sov-import/opening.ts`: the "columns disagree" check also reports C - G != H, on every sheet.
- `sov-import/pdf.ts` `totalMisreadCheck`: a line's C suspect is dropped when its row's H/% disagree
  with the swapped value.
- Tests: `misread-columns.test.ts` (13).

**What the next run should know.**
- The new C - G = H gap fires on spreadsheets too (not scans only). If a real form's "Balance"
  column turns out to mean something else (balance plus retainage, say), narrow the `balance` header
  rule in `schedule.ts`. A header that mentions retainage is already taken as the retainage column.
- A % that disagrees on its own is ignored by design: it is never imported.
- Part 4 still left: OCR in the browser for a scan with no text layer.

**Verification.** `pnpm typecheck` clean; `pnpm test:unit` exit 0; `run_workflow_locally.py
payapps-ci` here (result in the run record); `risk_review.py`: no check triggered.
