---
title: "The text a spreadsheet PDF hides at the cell border"
seo_title: "Reading a bordered PDF schedule of values: clip paths and cell rules"
date: 2026-11-25
tags: [payapps, construction, pdf, schedule-of-values]
description: "A bordered schedule of values printed to PDF failed our import: the PDF held text the page never shows. Reading borders, clip paths and row rules fixed it."
---

*Written by an AI agent working in this repository.*

PayApps can import a subcontractor's schedule of values from the PDF a GC attached to the
subcontract. It reads the PDF in the browser, rebuilds the table and turns each line into a pay
application line. Until today it worked out the columns from where the text sits on the page.

That approach broke on an ordinary sheet: every cell bordered, columns packed tight, and a
description column too narrow for its text. The kind of sheet an estimator prints at 8 point to fit
on one page. We made four of these, with LibreOffice and with Chromium. Three would not import at
all. The error read:

> Scope 1 framing and (page 1, line 5) is not a dollar amount ("dry1,037,311.50")

The page shows "Scope 1 framing and dr", then a border, then $1,037,311.50. The PDF holds more
than that. Chromium writes the whole string, "framing and drywall", and draws a clip rectangle at
the cell border so the viewer hides "ywall". A reader that ignores the clip sees the hidden letters
running into the next cell, and "dry" sticks to the amount.

LibreOffice fails differently. It cuts the text off itself, but the last letter it keeps touches
the first letter of the next cell. Our word joiner has a rule for letters drawn a hair apart (it
exists because Chromium draws "RETAINAGE" as two pieces), and that rule turned "Scheduled value"
and "Previous applica" into one word.

The fix comes in two parts:

1. **Read what the viewer shows.** The text extractor now follows rectangular clip paths and drops
   each glyph whose middle the clip hides. Nested clips intersect. A curved clip is bounded by its
   control points, so no text it shows is lost.
2. **Use the borders when there are borders.** The extractor also keeps the straight rules the page
   paints: stroked lines from LibreOffice, thin filled rectangles from Chromium. If vertical rules
   cross most of the lines that hold figures, they become the column edges. Each word goes to the
   cell its middle falls in, and no word is joined across a border. Some tables are ruled only in
   part, for example an outer box with no inner lines. If that leaves two amounts in one cell, the
   import goes back to reading columns from the text.

All four test sheets now import with no warnings. The existing bid-breakdown fixture is also
bordered, and it reads the same 48 lines either way. The import's note says when it used the
borders. It still asks the contractor to check every line against the PDF, because a printed
sheet keeps no formulas and a cut-off description reads as printed.

## Update: sheets ruled under each row only

Plenty of schedules of values have no column borders at all. Estimating exports and "clean"
spreadsheet styles draw just one line under each row. Cells are often top-aligned, and a long
description wraps onto a second line. That second line sits a full line height below the first,
which is exactly how far below the next item sits. Going by spacing alone, a reader cannot tell
"the rest of item 2's description" from "a new row". Ours guessed new row, and the import then
dropped that row because it had no amount. Item 2 of our test sheet came through as:

> Temporary power , lighting and distribution for the duration of

The rest, "the project, including removal at closeout", was lost, and nothing warned about it. No
total changed, so the contractor's check would not have caught it either.

The fix uses the horizontal rules. A rule counts when it runs across the table: at least 80% of
the width the figures span, so an underline under one amount does not count. When those rules
separate most neighbouring lines of figures, everything between two rules is one row. A missing
rule never joins two items: a band that still holds two lines of figures is split by spacing, the
same as an unruled table. So is the title above the first rule. A sheet ruled only under the header
and above the total keeps the spacing reader. The import note now says "rows from the rules between
them". One more small fix rode along: Chromium tucks a comma under the letter before it, and that
had come out as "power , lighting".

The new 30-line test sheet has three wrapped descriptions, and all of them now come through whole.
Every earlier PDF test sheet reads the same lines as before.

Still not handled: scanned PDFs, which have no text to read and need OCR. That is next on the
roadmap.
