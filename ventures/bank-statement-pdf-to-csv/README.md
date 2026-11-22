# Bank Statement Pdf To Csv

Free browser tool that converts a bank or credit card statement PDF (text-based, or a scan or photo read by OCR in the tab) into CSV for Xero,
QuickBooks Online or a spreadsheet, or an Excel workbook that re-checks itself, and proves the result against the statement itself: opening
balance plus every row must equal the closing balance, each row is checked against the printed
running balance, and a gap is reported with its amount, the line where the balance first breaks, and
the likeliest cause (a missing row, a row on the wrong side, a flipped sign). The PDF is read
locally and never uploaded.

**Live tool:** https://marisstella.app/bank-statement-pdf-to-csv/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/bank-statement-pdf-to-csv/
```

## Measured on statements from elsewhere

`eval/README.md` has the method and every number. On the five published
statements of an independent, MIT-licensed statement-parsing benchmark (US
card, Singapore, Netherlands in Dutch, Hong Kong with two accounts, Canada in
French) the reader went from 1 of 5 to 5 of 5 read to the right row count and
proved by the statement's own balances. On two statement PDFs from other
open-source parsers, run afterwards, it first failed both; with two more
layouts (the date printed once per day, one-decimal amounts) it matches 100 of
100 and 56 of 62 rows on date and signed amount, and flags the second as not
adding up. None of these is a real customer's statement.

A second round (2026-11-14, `eval/README.md` "Round 2") read glyph widths
from the font so text placed a few letters at a time joins back up, and added
whole-number balances tagged CR/DR, an end-of-transactions marker, a
misprinted-balance finding and spacing-aware descriptions: the transtractor
fixture went from 56 to 62 of 62 rows right and proved, and its held-out twin
from unbalanced to proved.

What the reader handles now: month names and balance labels in English,
French, Dutch, German, Spanish, Italian and Portuguese; amounts like
`1,234.56`, `1.234,56`, `1 234,56 $` and (when a statement prints them)
`1935.3`; WinAnsi `€`; several accounts in one PDF, each proved by its own
running balance and printed totals, with an Account column or one account per
Xero/QuickBooks file; bank or card detected from the statement; rows that share
the date above; footers, watermarks and later tables kept out of the rows.

## Scanned statements and photos (OCR, 2026-11-17)

A PDF with no text layer (a scan) or a photo of a page is read by OCR in the
browser, opt-in: the page offers **Read the scan (OCR)**, and only then
downloads tesseract.js (pinned 5.1.1, about 20 MB, cached afterwards) from
jsDelivr. The statement itself is read inside the tab and sent nowhere
(`ocr.mjs`):

- `pageImages` takes the picture out of each page of the PDF: JPEG (DCT) scans
  byte for byte, Flate grey, RGB or 1-bit images as pixels (PNG predictors
  undone); CCITT fax, JBIG2 and JPEG 2000 are named and refused. A page's
  `/Rotate` is applied before reading.
- `linesFromWords` keeps each OCR word's position, in character widths, so
  amounts stay under their Withdrawals, Deposits and Balance headings and the
  same row reader as text PDFs runs on them. The page's skew is measured
  between neighbouring words and taken out before words are grouped into rows
  (a 1 degree turn moves the right edge of a 200 dpi page by a line's height).
  Figures are cleaned of OCR look-alikes (`4.5O`, `2,202:33`, `1,335,22`, and a
  lone `21713` on a row of decimal figures becomes `217.13`).
- `parseStatement(lines, { ocr: true })` then corrects figures the running
  balance proves were misread (`repairByBalance`, adapted from
  `ai-bookkeeper`'s CLI): only when the row's printed balance is confirmed by the
  next row (or the closing balance), the new figure differs from the read one
  by one digit (two in a number of the same length; 1/7, 3/8, 5/6, 6/8 and 0/8
  count half), and the change moves the balance the way the row's column says.
  The first row is never corrected against the opening alone. Every correction
  is a warning that lists the line and both figures, and the table marks it.
  Pasted and text-layer statements are only checked, never corrected.

The misread gate is what keeps a lost row visible: without it, a scan missing
a 2,000.00 deposit "repaired" the next row's 1,200.00 withdrawal into an 800.00
deposit and the statement balanced (the `lost` case in `ocr.test.mjs`).

**Measured** (`node eval/scans.mjs`, needs playwright, tesseract 5 and
ImageMagick; output in `eval/scans-2026-11-17.txt`): 36 made-up statements in
three layouts (US withdrawals/deposits, debit/credit with full dates, UK paid
out/paid in with month names), drawn at about 200 dpi, turned up to 1 degree,
noised, blurred and saved as JPEG at quality 40 to 85, wrapped as image-only
PDFs and read back through `pageImages`, tesseract and the reader. 11 of them
also have one row painted out of the picture while the balances stay:

| 36 scanned statements, 854 rows | repair off | repair on |
|---|---|---|
| rows right (day and signed amount) | 833 (97.5%) | 842 (98.6%) |
| intact statements read perfectly (of 25) | 14 | 19 |
| intact, imperfect, and the page says so | 11 | 6 |
| intact, imperfect and silent | 0 | 0 |
| row-lost statements flagged (of 11) | 11 | 11 |
| row-lost statements passed as proved | 0 | 0 |

The page itself was driven in headless Chromium with tesseract.js 5.1.1 (the
CDN files served from the npm packages): on six of these scans it made no
request before the click and none afterwards beyond the four engine files; the
three intact ones were proved (one figure corrected), and the three with a lost
row were each reported as not adding up, with the missing amount named.

Limits: synthetic statements in two fonts, English only; tesseract.js and the
tesseract CLI read the same picture slightly differently. No real bank's scan,
phone photo of a curled page or non-English scan has been through it yet; that
is the next input wanted.

## Bank files and a year of statements at once (2026-11-18)

`bankfile.mjs` writes the same proved rows as a bank download file, and joins
several statements of one account into one run:

- **OFX, QFX, QBO** (OFX 1.02 SGML, the version QuickBooks Desktop, QuickBooks
  Online Web Connect and Quicken read) and **QIF**. Each transaction's FITID
  is its date plus a hash of date, amount and normalised description, with a
  counter for identical rows on one day, so the same row read from two
  overlapping statements gets the same id and the importer skips it.
  `LEDGERBAL` is the statement's printed closing balance (OFX requires one;
  strict readers refuse a file without it, which the first eval run found);
  a card's balance owed is written negative and its posting date is
  `DTPOSTED` with the transaction date as `DTUSER`. Accents fold to ASCII and
  markup is escaped. A row with no year is refused, not guessed. QFX/QBO carry
  `INTU.BID` only when the user enters a numeric one.
- **Several statements** (`stitch`): choose many files at once on the page.
  They are sorted by date, each must prove on its own, and each opening must
  equal the previous closing; a missing month is reported as a gap of exactly
  its net movement, naming the files either side. The same statement chosen
  twice is counted once; rows shared by overlapping downloads are kept once.
  Statements holding several accounts are refused in a join.

**Measured** (`node eval/bank-files.mjs <dir>` then
`python eval/bank-files-check.py <dir>` with `pip install ofxtools ofxparse`;
output in `eval/bank-files-2026-11-18.txt`): the bank and card examples and a
made-up year of 12 monthly statements, each built as a PDF and read through
the real PDF route, then the year again with June left out. 12 OFX/QFX/QBO
files: ofx-file-check reports no errors or warnings on any, and ofxtools and
ofxparse each read the expected rows, net amount and ledger balance from all
12 with unique ids (0 mismatches). With June left out the join reports a gap
of 2,383.17 between May and July, which is June's own net movement. The page
was driven in headless Chromium with three PDFs: a two-file join with
February missing showed the 925.01 gap; the full three-file join proved and
downloaded a 6-row `.qbo`, with no request leaving the page.

Not tested: an import into QuickBooks or Quicken themselves (no licence here),
and real banks' statements. Batch conversion was listed below as a paid-tier
candidate; it ships free for the same reason OCR did: it runs on the visitor's
machine at no per-user cost.

## An Excel workbook that checks itself (2026-11-22)

"Convert bank statement to Excel" is the phrase most people search, and the
paid per-page converters sell an Excel download. A CSV opened in Excel loses
what made the rows trustworthy here: dates arrive as text (or as the wrong
day when Excel guesses 03/04 the other way round), and the balance proof stays
behind on the page. **Download Excel (.xlsx)** (`xlsx.mjs`, no dependency)
keeps it in the file:

- dates are real Excel dates and amounts real numbers (money in, money out,
  signed amount), so they sort, sum and pivot;
- each account gets a sheet with the balance the statement printed beside a
  **running balance written as formulas** (opening, then the row above plus
  each row; a card's balance owed rises with a charge), and a **Check** column
  that says `ok` or `off by 12.34` on every row;
- a **Summary** sheet totals money in and out with `SUM` formulas over those
  sheets and compares opening + net with the printed closing balance, per
  account (with the statement's printed totals for a PDF holding several
  accounts), and for a year of joined statements lists each file and any gap;
- the findings are a sheet of their own.

So the check travels with the file: delete a row or change an amount later in
Excel and the checks and Summary recalculate and say where. Each formula is
also written with its value, computed in integer cents, for readers that do
not calculate; the workbook asks Excel and LibreOffice to recalculate on open.

**Measured** (`node eval/xlsx-check.mjs OUT <pdf folders>`, needs
LibreOffice; output in `eval/xlsx-check-2026-11-22.txt`): each statement is
written a second time with no cached formula values, LibreOffice 24.2 opens it
and must calculate every formula itself, and every cell of every sheet is
compared with what this tool computed. On 11 workbooks (the three examples, a
joined two-month run, the five benchmark PDFs including the two-account Hong
Kong one, and the two transtractor fixtures) **3,280 cells, 830 of them
formulas, 0 differ.** The first run of that check found a real fault before
it shipped (formula cells written as the number 0.01) and, once fixed, float
noise in a Difference cell (-86.1900000000005), now rounded to the cent.
Blanking one amount (86.19) in a written workbook and letting LibreOffice
recalculate turned that row and every row after it to `off by 86.19` and the
Summary to `no, off by 86.19`. The shipped files also read in openpyxl with
the Summary's verdict intact. The page was driven in headless Chromium: the
bank example and the lost-row example each downloaded (5.7 kB,
`statement.xlsx` and `statement-unproved.xlsx`), with no request leaving the
page.

Not tested: opening the files in Microsoft Excel itself (no licence here;
the format follows the same SpreadsheetML another venture in this repository
writes) or Google Sheets, and real customers' statements.

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic, kept separate from the page so it can be tested.
- `xlsx.mjs`: the Excel workbook (Summary, a sheet per account with running-balance and Check formulas, Findings) and its zip writer.
- `bankfile.mjs`: OFX, QFX, QBO and QIF from a read statement, and several statements joined and checked month to month.
- `ocr.mjs`: scans and photos: the picture out of each PDF page, OCR word boxes into column-aligned lines, the tesseract.js loader (on click only).
- `usage.mjs`: anonymous, opt-in-only usage counters (off by default; see
  `portfolio/usage/README.md` in the monorepo).
- `*.test.mjs`: tests for the logic and the page (`layouts.test.mjs` rebuilds each
  benchmark layout from synthetic lines).
- `eval/`: `bench.mjs`, `score.mjs` and `dump.mjs` for measuring the reader on
  outside PDFs (none committed); results in `eval/README.md`. `scans.mjs`
  measures the OCR route on degraded synthetic scans.

## License

MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.
