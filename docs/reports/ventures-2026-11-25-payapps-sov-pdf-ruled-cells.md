---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): SOV import reads a ruled PDF table by its cell borders

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#124 (merged). ROADMAP Next #4,
"SOV import from a PDF, part 2"; claim `claim/payapps/sov-pdf-ruled-cells`.

**What landed.**
- `apps/payapps/src/shared/pdf/text.ts` now returns `rules` per page: the straight, axis-aligned
  rules a page paints. LibreOffice strokes each border as a line (`m l S`). Chromium fills a 1-unit
  rectangle per cell edge (`re f`). White paint, large fills (backgrounds), curves and clip-only
  paths are left out. Capped at 50,000 rules per file and 4,000 segments per path.
- The same extractor now honours rectangular clip paths (`re W n`). Nested clips intersect,
  curves are bounded by their control points, and a clip carries into form XObjects. A glyph whose
  middle the clip hides is dropped, so the text read is the text a viewer shows.
- `apps/payapps/src/shared/sov-import/pdf.ts`: vertical rules crossing at least 60% of the data lines
  become the column edges. Each word goes to the cell its middle falls in, and runs are never joined
  across a border. The table falls back to text-position columns when more than 10% of data lines
  have two amounts in one cell or an amount across a rule, or when there are no borders. The import
  note says "columns from its cell borders".

**What the real files taught** (fixtures `sov-ruled-chrome.pdf` and `sov-ruled-libreoffice.pdf`):
- Chromium leaves clipped glyphs in the content stream. A description cut off at its border still
  carries "ywall", which then glued onto the amount: "dry1,037,311.50". Without clip handling the
  borders alone do not fix it.
- LibreOffice cuts the text itself, but the last shown letter touches the next cell's first one.
  The word joiner's kerned-pair rule (written for Chromium's "RET"+"AINAGE") then made "Scheduled
  valuePrevious applica" one word. The fix is that no join crosses a border.
- Before: 3 of 4 dense bordered sheets failed outright. After: 4 of 4 import with no checks
  raised. The bordered Chrome bid-breakdown fixture reads the same 48 lines on either path.

**Verification.** All local: `pnpm typecheck` and biome were clean. `test:unit` passed 451 tests in
51 files, run before the form-XObject clip test was added; the PDF and SOV-import tests pass
alongside it. `test:worker` passed 257 tests in 40 files, and `pnpm build` succeeded. The private
repo's `payapps-ci` check failed within 1–3 s with no log, the same as on merged PR #123: no runner
started, so the local runs are the verification.

**Next** (ROADMAP "SOV import from a PDF, part 3"): OCR for scans, and rows taken from horizontal
rules when line spacing misleads.
