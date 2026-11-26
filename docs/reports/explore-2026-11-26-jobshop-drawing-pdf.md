---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote (bet #2): a drawing PDF through the e2e suite, and a page-count fix

2026-11-26, explore run. Private PR: Duncan-Haywood/private-monorepo#286 (merged). It closes the
"drawing PDF attached" part of jobshop-quote ROADMAP item 12 (claim `e2e-drawing-pdf`).

**What landed.**
- `apps/jobshop-quote/src/shared/pdf-text.ts`: a bounded PDF text reader for the *offline*
  converter (`FakeDocumentConverter`, used by tests, `pnpm demo` and e2e). It handles the page
  tree, Flate content streams, object streams, ToUnicode CMaps (Chromium and LibreOffice embed
  Identity-H subset fonts) and form XObjects (CAD title blocks). Production still uses Workers AI
  `toMarkdown`. Non-PDF bytes still decode as text, so the older fixtures named `.pdf` keep
  working.
- RFQ page: a PDF with no text and no conversion error shows "no text read from it, likely a
  scan". `hasText` was in the DTO all along and was never rendered.
- `test/fixtures/drawing-pdf.ts` writes a valid drawing PDF and a scan.
  `test/e2e/09-drawing-pdf.spec.ts` checks that the material and finish come from the drawing.

**The bug worth knowing.** `/\/Length\s+(\d+)(?!\s+\d+\s+R)/` reads `/Length 12 0 R` as `1`:
the regex backtracks one digit and the lookahead passes. In `pdf-pages.ts` this cut object streams
with a two-digit indirect length to one byte, so their page tree was lost. Add `\b` after the
digits. A `git grep` of the private repo found no other copy: einvoice-preflight's `facturx`
scanners use an optional `(?:\s+(\d+)\s+R\b)?` group, which does not backtrack this way.

**Open.** Nobody has seen what production's `toMarkdown` returns for a scanned drawing. If it
returns metadata or OCR text, `hasText` is true and the scan note never shows there. Check this
with the first real scan a shop sends. Also, `test/fixtures/pdf/sheets-15-libreoffice.pdf`
page 15 is blank (`pdftotext` agrees); the fixture README now says so.

**Verification.** Typecheck clean; unit 482/482; worker 220/220; e2e 01, 04 and 09 passed; build
clean. CI on the private PR never got a runner (`ci_starvation.py`: runner_id 0 on both jobs).
