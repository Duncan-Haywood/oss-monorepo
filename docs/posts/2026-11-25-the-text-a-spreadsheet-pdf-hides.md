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

## Update: PDFs from older software

The import reads a PDF's text out of its content streams, and those streams are almost always
compressed with one method, Flate (zlib). The PDF standard defines four more that carry text rather
than images: LZW, ASCII85, ASCIIHex and RunLength. Older print drivers, PostScript-to-PDF
converters and some accounting and scanner exports still write them. Our reader knew only Flate. On
such a file the import found no text at all and said the PDF had no table. If even the file's index
was compressed with LZW, the backup packet refused it as damaged and asked the contractor to send it
separately.

The reader now decodes all four, in any combination: a stream can be ASCII85 on top of LZW, and
both are undone in order. It also handles the "TIFF" predictor, a small transform some writers
apply before compressing. Each decoder stops at the same 64 MB limit as Flate, so a small file
cannot expand without bound. Image-only methods (JPEG and fax compression) are still not decoded,
on purpose. Nothing reads the pixels: a page's images go into the packet byte for byte.

To check it we built five test files with a separate encoder, one per method plus one with its index
in LZW. A standard PDF viewer (poppler) reads all five. Before the change our reader got no text from
four of them and refused the fifth. Now all five give the same 93 lines of text. Their packet pages,
rendered and compared pixel by pixel with the originals, differ only in the page stamp.

## Update: scans saved as searchable PDFs

Many offices scan paper to a "searchable PDF". Office scanners have a setting for it, and so do
phone apps such as Adobe Scan and Microsoft Lens. The file holds the page as a picture and, on top
of it, the text the scanner's OCR read, drawn invisibly so the page can be searched and copied. Our
reader already read that invisible text, yet every such file we tried failed to import with "Could
not find the table header".

The cause was the paper, not the text. A sheet never lies quite square on the glass. At a tilt of
0.4 degrees, an amount at the right edge of a line sits 3.7 points lower than the item number at its
left. The import counts text as one line only when it is within 3 points (0.3 of the type size), so
each line split in two, and the header row and the amounts came apart.

The import now spots a scan: most of the text is drawn invisibly, a mode the PDF standard defines
for exactly this purpose. It measures each page's tilt by taking the slope from each word to the
next word on its line and using the median, and levels the page before rebuilding the table. A
slope steeper than about 5 degrees is treated as slanted text, not a tilt. It also drops the
characters OCR invents from a table's printed borders, such as a "|" before a word or a lone ")".
Three smaller fixes help any PDF that places every word separately: a number inside a description
("scope item 1") stays in the description, two header words a little apart ("Cost" "Code") stay one
heading, and a header repeated on page 2 with a smudge read beside it is dropped like any other
repeat. Printed PDFs are not levelled. When we tried, a sparse summary page paired words across
lines and reported a false tilt.

To test it we printed our bid breakdown, turned it into grey page images, tilted them, added
speckle and ran Tesseract 5.3.4 over them to make two searchable scans: 0.4 degrees at 200 dpi, and
1.5 degrees the other way at 300 dpi. Both failed before. Both now read all 48 lines and the
$1,120,223.00 total, which matches the sheet's own total line. By hand we also checked 0 and -0.8
degrees, which read correctly. At 2.5 degrees, or at 150 dpi, Tesseract's own text is too garbled to
use: the import refuses and says to rescan the sheet straight at 300 dpi.

The OCR still makes mistakes, and we do not hide them. In both test scans "Temporary power" came
back as nonsense, and one item number lost a space. Every import from a scan carries a note that
says the lines came from OCR and to check each amount against the paper. The check of the sheet's
own total against its lines catches a misread figure whenever the sheet prints a total. The file is
still read in the browser and never uploaded.

Still not handled: a scan with no text layer at all. The import says to save it again as a
searchable PDF.
