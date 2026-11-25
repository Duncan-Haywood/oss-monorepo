---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): schedule-of-values import from a PDF bid breakdown

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#104.

**What landed.** The SOV import and the mid-job opening-balance fill take a text PDF as well as
.xlsx and CSV, read in the browser (never uploaded). Two layers, both dependency-free:

- `apps/payapps/src/shared/pdf/text.ts` and `fonts.ts`: positioned text from a PDF's content
  streams (text operators, TJ kerning, form XObjects, page rotation; ToUnicode CMaps, simple-font
  encodings and `/Differences`, widths). Bounded (40 pages, 2M operators, 32 MB content).
- `apps/payapps/src/shared/sov-import/pdf.ts`: rows and columns from that text, then the same
  `findSov` the spreadsheet path uses. Sources read "page 2, line 14".

The PDF reader the backup packets use moved from `services/export/pdf-merge/` to
`src/shared/pdf/` so the client bundle can import it.

**Why a buyer cares.** A sub's schedule of values often exists only as the PDF bid breakdown the
GC attached to the subcontract. Typing 50 lines from a PDF is the first chore of every job; this
removes it, and the free SOV template page (pay-app-guides) now says so.

**What the layout rules learned from real files** (fixtures printed by Chromium and LibreOffice,
in `apps/payapps/test/fixtures/`):
- Spreadsheet PDFs draw wrapped header cells one glyph at a time, with the space glyph as its own
  TJ piece; treat a blank piece as a space, and join TJ pieces only across kerning-sized gaps.
- Lines closer than ~0.85 em are one table row: wrapped cells are vertically centred, so their
  neighbours sit between the wrapped lines.
- Columns come from data lines only (two or more numbers); header and title text is placed by
  phrase, so a centred header wider than its numbers stays whole.
- An item number right-aligned in its cell sits one space from the description; only alignment
  across lines separates them (`itemSplit`). Adjacent columns never filled on the same row are one
  column (`mergeComplementary`), which joins right-aligned `1` with left-aligned `CO-1`.

**Limits.** No OCR (a scan ends with a message), no decryption, no column detection from drawn
cell borders. A PDF whose text was clipped by the printer (narrow columns) reads as printed; the
sheet-total check flags a line that went missing.

**Next.** Roadmap "SOV import from a PDF, part 2": ruled tables by their cell borders, an empty
user password, OCR for scans if usage shows people try them.
