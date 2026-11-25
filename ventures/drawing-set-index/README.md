# Drawing set index

Drop a construction drawing set PDF and get the **sheet index**: every sheet's
number, title, discipline and sheet type, with the cover sheet's drawing index
checked against the sheets actually in the set. Drop **two issues** to see
which sheets were added, removed, retitled, or had notes changed. Runs in the
browser with no upload, or as a CLI. FSL-1.1-MIT licensed, no dependencies.

Live: https://marisstella.app/drawing-set-index/

## Why someone would use it

Every issue of a drawing set (schematic, permit, bid, construction, each
addendum and bulletin) needs a current sheet index on the cover, a transmittal
listing what was sent, and, for whoever receives it, an answer to "which
sheets changed?". Project engineers, document controllers, permit expediters
and estimators retype sheet lists by hand and flip through two sets side by
side to find changes. Stale cover-sheet indexes (a sheet added but not listed,
a sheet listed that was pulled) are a routine plan-review comment.

What people use today:

- **By hand**, typing from the title blocks into Excel.
- **Paid PDF tools**: Bluebeam Revu's batch slip-sheet and page-label
  features, and its overlay compare; construction platforms (Procore,
  Autodesk Construction Cloud) read sheet numbers when a set is uploaded
  ("OCR sheet detection") as part of their subscriptions.

What this does differently: free, nothing uploaded, an open algorithm whose
accuracy is measured and published below, a set check nobody else surfaces as
a list (cover index against sheets, duplicates, order), and CSVs that drop into
whatever log the team keeps. It is not a viewer and does not overlay
linework.

## How it reads a sheet

1. **Text with positions.** `pdf-text.mjs` (the repo's dependency-free reader,
   from `submittal-register`) reads each page's content stream, following Form
   XObjects (placed title blocks, CAD blocks) and skipping inline images by
   their size, and keeps every run's size, angle and position plus the page's
   straight rules. Sheets drawn sideways on a portrait page are turned upright
   by the dominant text direction.
2. **Sheet number.** ID-shaped phrases (`A-101`, `A101`, `A1.01`, `S-100-A`,
   `ASK - 001`, `_S100`; a plot stamp run into the number is split off) are
   scored by size against the page's largest text and by closeness to the lower
   right. Then the set votes: the 3%-of-sheet cell where most pages have a large
   ID is the title block's number cell, and each page takes its candidate there
   (else its own best). A title block that prints `TITLE - (A100)` on one line
   is read as both.
3. **Title.** The largest text within reach of the number that is not repeated
   on three quarters of the sheets (firm, project, address), not a date, scale,
   field label, street address, or revision-table row; stacked lines of the same
   size join only when aligned and not separated by a ruled cell border. A
   trailing date ("BUILDING SECTIONS - 03/13/2018") is dropped.
4. **Discipline and sheet type** from the US National CAD Standard's Uniform
   Drawing System designators (`S` Structural, `A` Architectural, ...; the first
   digit is the sheet type: 1 plans, 2 elevations, 3 sections, 5 details ...).
   The index sorts in the NCS's binding order.
5. **Drawing index.** A column of four or more IDs at one X, each with a title
   to its right, at least half of them sheets in the set, is the cover sheet's
   index (a schedule's column of marks is not).

**Set check** (`checkSet`): pages with no number (or no text layer), numbers
used twice, numbers falling within a discipline, a discipline split into two
runs of pages, and the drawing index against the sheets (listed but missing,
present but unlisted, titles that disagree; a title cut short by the index
column counts as the same).

**Compare** (`compareSets`): matches issues by sheet number; each sheet's text,
minus repeated title-block text, plot stamps and dates, is compared as a
multiset of phrases, so a moved note is not a change and a renumbered callout
is. Linework is not compared.

## Use it

Browser: open `index.html` (served over http; module workers do not run from
`file://`), choose a set (one PDF, or one file per sheet) or two issues.

CLI:

```
node cli.mjs set.pdf --csv index.csv          # index + set check
node cli.mjs A-101.pdf A-102.pdf ... --json   # one file per sheet
node cli.mjs --compare old.pdf new.pdf --csv changes.csv
```

Tests: `node --test engine.test.mjs page.test.mjs`. They run on a made-up
five-sheet set written as a real PDF by `sample.mjs` (also the page's sample).

## How it was checked

On public drawing PDFs from OpeningDesign's open architecture projects on
GitHub (fetch and scripts: [`eval/README.md`](eval/README.md)):

| Test | Result |
| --- | --- |
| 123 single-sheet PDFs, truth from the file name | sheet number 121 of 123 (98.4%); number and title 115 of 123 (93.5%) |
| same, after the 3 files whose names disagree with the sheet are corrected | number 123 of 123; number and title 118 of 123 |
| 14 whole sets, 180 pages (8 are renderings with no text layer) | a number on 172 of 172 pages with text, each printed on its page (pdftotext); title printed on its page for 167 of 172 |
| the 25 sheets of the two sets also exported one sheet per file | number and title 25 of 25 |

What the first passes got wrong, and the fixes, are the measured part of the
work: the first single-sheet run read 74.0% of numbers, because Ghostscript
writes hatching as thousands of inline images and the borrowed tokenizer lost
its place in their binary data (it now skips an image by its size); titles went
from 48.8% to 93.5% with rules between title-block cells, address and
revision-row filters, and alignment for stacked lines. Along the way the reader
found a real fault in a public set: the Organic Grocery Store progress set of
2019-03-08 has two different sheets numbered A501 (pages 17 and 20); the
permit set the next day does not.

Limits: nine projects from one office, mostly Revit exports. Not yet measured
on an AutoCAD or ArchiCAD office's sets, a civil or MEP consultant's title
block, or a set over 25 sheets. Scanned sets need OCR first.

## Next

- More offices' sets (public agency bid sets, university capital projects) to
  measure the number and title readers outside one title block family.
- Revision clouds and the title block's revision table: which sheets claim a
  new revision, checked against the sheets whose text changed.
- A linework signature (counts and extents of stroked paths per region) so
  "same text" can say "and same linework" or "linework changed here".
- Slip-sheeting: write a combined set PDF with page labels and bookmarks named
  by sheet number.
