---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): mid-job start reads lines 5a and 6 from the G702 summary sheet

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#119 (merged).

**What landed.** This is the next piece of "Mid-job start, part 3" in the payapps ROADMAP. A
contractor who moves a job mid-stream fills the opening balance from the workbook of their last
application. Until now only the continuation sheet (G703) was read. If any materials were stored,
line 5a stayed blank, because the G703's retainage column lumps retainage on work (5a) together
with retainage on stored materials (5b). The fill now also looks for a summary tab in the same
workbook: a G702, or the contractor's own "Application summary". It reads lines 4, 5a, 5b, 5, 6,
7 and 8, plus the application number and the period end. Line 6 and line 5a are taken from there.

**Why a buyer cares.** 5a sets the retainage carried into the first application made in PayApps,
and line 6 sets "previous certificates". Both have to match what the GC certified. Contractors
send their workbooks with the G702 and G703 as two tabs, so the summary was in the file they
already pick. They just had to copy it by hand.

**Choices to keep.**

- Lines are found by their label, never by position. The amount is the last dollar cell to the
  right of the label, so the rate typed before it ("10 % of Completed Work") and column notes are
  never read as money. A "5. RETAINAGE:" heading with no amount leaves line 5 free for the "Total
  Retainage" row below it.
- If the summary gives no amount for 5a, 5a is worked out as line 5 less 5b. When nothing is
  stored, 5a is the whole of line 5.
- The summary wins over figures worked out from the continuation sheet, because it is what the
  application stated. Every disagreement becomes a medium check that names both figures: summary
  against continuation sheet, 5a + 5b against 5, and 4 less 5 against 6.
- If the summary is for a different application number or period end than the continuation sheet,
  none of it is used, and a high check says why.
- A cell holding an uncalculated formula is named, never read as $0.00. The free template's own
  Summary tab, which is all formulas, lands on that path.
- PDFs are not covered yet. A printed application has the summary on page 2, and that stays on the
  ROADMAP.

**Verification.** `pnpm typecheck` was clean, `biome check` was clean, `pnpm build` passed and
`pnpm test:unit` passed 48 files and 416 tests. Eight of those tests are new in `summary.test.ts`.
They cover the LibreOffice fixture with a G702 tab added, plus the free template's own Summary tab.
In the private repository, Actions jobs end in about 2 s with no log, the same as on PR 118, so
these local checks stood in for CI.

**Next on this thread.** Retainage released on each line before the move, and the summary read
from page 2 of a PDF.
