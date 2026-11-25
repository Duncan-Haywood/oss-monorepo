---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): mid-job start reads the G702 summary page of a PDF

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#123 (roadmap claim
`mid-job-start-part-3-g702-pdf`).

**What landed.** `importSovPdf` now attaches `summary` the way `pickSov` does for workbooks, so
the opening-balance fill takes line 6, 5a, 5b and the application number/period from a PDF's
summary page. `summaryPages` (sov-import/pdf.ts) turns each page into a sheet with a cell per
phrase, split at leader dots and after each dollar figure. `findSummary` takes `printed` (the
first dollar figure right of the label, which must show cents or a "$") and `where` ("page 1,
line 9" instead of "cell H16").

**What the next run should know.**
- Pages where `findSummary` finds a key line are removed before `tablesFromText`. Otherwise the
  5a/5b lines ("10" plus an amount) count as data lines, the page joins the G703 table and its
  bands merge into the item column. If nothing else is left, all pages are used.
- Chromium draws kerned capital pairs as separate runs that overlap by about 0.07 em. `toWords`
  now joins two runs, letter to letter, that overlap by less than 0.15 em. A clipped description
  running into an amount still stays split, because the amount starts with a digit.
- A G703 printed from HTML puts the column letter in the label's cell ("A Item No."). `headerAt`
  drops a leading "X " when three or more cells of a row start that way.
- Fixture `test/fixtures/g702-g703-chrome.pdf` and its generator (`pdf-sources/`) print the
  expected figures. The test checks every summary line, including the "amount certified" decoy.

**Verification.** Unit suite 441/441, typecheck and biome are clean. Private CI fails in about 3 s
with no logs on every PR (PR 121 too), so the payapps-ci steps were run locally. Results are in
the PR.

**Next.** Part 3's remaining half is per-line retainage released before the move, which needs a
schema change. A G702 and G703 printed on one page are not split yet.
