---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): SOV import from a PDF takes rows from horizontal rules

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#129 (merged). ROADMAP Next #3,
"SOV import from a PDF, part 3", the horizontal-rules part; claim `claim/payapps/sov-pdf-horizontal-rules`.

**Bug.** On a sheet with a rule under each row and top-aligned cells, a wrapped description's
second line is a full line below its first. `toRows` (spacing < 0.85 × font size joins lines) made it
a row of its own, and `findSov` dropped that amount-less row with no warning. The description was cut
short and every total stayed right, so nothing flagged it.

**What landed** (`apps/payapps/src/shared/sov-import/pdf.ts`):
- `horizontalRules` joins thin horizontal rules end to end (Chromium paints one per cell).
- `rowRules` keeps rules spanning ≥80% of the data lines' width (dedupes double borders within
  2 pt). It returns them only when they separate ≥60% of neighbouring data-line pairs.
- `toRows(lines, rows)`: lines in one band between two rules are one row. These are split by spacing
  instead: a band with two or more data lines, and the bands above the first or below the last rule.
- `PdfTable.rowsRuled`. The import note says "rows from the rules between them", or "rows and columns
  from its cell borders" when vertical borders were used too. The bid-breakdown test's expected note
  changed accordingly.
- `toWords`: a run starting with `,.;:)` drawn kerned under a letter joins that word.

**Fixture:** `test/fixtures/sov-hrules-chrome.pdf` (source `pdf-sources/sov-hrules-chrome.cjs`,
Playwright). It has 30 lines, a $759,491.25 scheduled total and 3 wrapped descriptions. Before the
change, the wrapped parts were lost. After it, all 30 lines read whole.

**Verification.** All local: `pnpm typecheck` clean, biome clean, `pnpm test:unit` 476/476 in 54
files, and `pnpm build` succeeded. The private `lint, types, tests, build, migrations` check failed in
3 s with no log (HTTP 404 on logs), the same as on merged PR #128: no runner started.

**Next:** OCR for scanned PDFs is the last open part of "SOV import from a PDF, part 3".
