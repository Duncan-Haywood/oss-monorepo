---
title: "A scanned bank statement carries its own checksum, so the OCR can be checked"
seo_title: "Scanned bank statement PDFs: OCR checked by the running balance"
date: 2026-11-14
description: "ai-bookkeeper now reads image-only statement PDFs by OCR and fixes misread digits from the running balance: 36 of 40 synthetic scans read perfectly."
tags: [ai-bookkeeper, ocr, bank-statements, evaluation]
---

Plenty of small businesses never get a bank CSV. They get a PDF. Sometimes the PDF is only a picture of the page: a statement the bank scanned, or one somebody scanned off paper. Until today the ai-bookkeeper refused those with "no text layer (a scan)". Now `import scan.pdf --account 1000` reads it. It draws each page at 300 dpi with poppler's `pdftoppm`, runs `tesseract` over it, repairs the usual digit look-alikes (`4.5O` becomes `4.50`), and hands the text to the same reader that handles statement text pasted from a PDF. It all runs on your own machine. A photo of a page (`.jpg`, `.png`) works the same way.

## OCR misreads digits. Statements say when.

A receipt has a total and maybe a tax line to check against. A bank statement has more. Each row's running balance must equal the one before it plus the row's amount, and the opening balance plus every row must reach the closing balance. That makes it a checksum, and the import uses it in three ways.

1. **Repair, but only on two-sided evidence.** Suppose `1,222.75` is read as `1,222.15`. The row then fails to carry the balance from 18,905.04 to 20,127.79. But the next row starts from 20,127.79 and its own arithmetic works, so the printed balance is confirmed and the amount must be the misread figure: it is 20,127.79 - 18,905.04 = 1,222.75. The import makes that change and prints it, old figure and new, with "check it on the page". When the next row instead chains from the previous balance plus this row's amount, the balance was the misread figure, and that gets fixed. A row whose amount came out as garbage (`1.22e,00`), so that its balance got read as its amount, is put back the same way. When the evidence only points one way, nothing is changed and the break is reported. The first row is never repaired against the opening balance alone, because the opening may be the misread figure.
2. **Opening to closing.** If the rows don't add up from the opening to the closing balance, the import says by how much. A card statement's previous and new balance count what is owed, so they run the other way.
3. **A second reading.** If a check still fails, the pages are read again in tesseract's single-column mode (`--psm 4`), and whichever reading has fewer faults is kept.

## How well it works, on scans I made

I don't have a real scanned statement, and I wasn't going to use a stranger's. So the benchmark makes its own. `eval/scanned-statements.mjs` typesets 40 made-up statements in four layouts: withdrawal, deposit and balance columns; Chase-style sections with no balance column; a card statement; a UK current account with day-first dates. Chromium renders each one at 200 dpi. Then the script degrades it like a scan (a skew of up to 1.2 degrees, noise, blur, JPEG compression), saves it as an image-only PDF, and reads it back. The comparison below uses the same 40 images both times:

| 703 rows, 40 statements | one reading, no repair | repair + second reading |
|---|---|---|
| rows right (date, amount, direction) | 691 | 694 |
| statements read perfectly | 32 | 36 |
| imperfect, and the import says so | 7 | 3 |
| imperfect and silent | 1 | 1 |

What matters most is the bottom row. Only one bad statement out of 40 gets through without a warning: a card statement with no balance printed anywhere, where OCR lost a row. Nothing on that page could catch it.

## Three reader bugs the scans found

The bigger gains came from bugs the synthetic scans exposed. All three are in the text reader, so they also affected anyone pasting text from a PDF:

- **Card payments read as spending.** A card statement with no section headings prints payments with a minus (`PAYMENT THANK YOU -1,238.92`), and the reader booked every row as money out. Now, when the header says card and no row has a running balance, the minus rows are payments and credits.
- **The UK "brought forward" line.** A dated "Balance brought forward" line wasn't taken as the opening balance, so the first row's direction was a guess. That accounted for three of the eight statements the reader got wrong without saying so on an earlier run.
- **Both balances on one line.** A summary line like "Beginning balance 8,379.39 Ending balance 14,354.60" was read as an opening balance of 14,354.60. The repair then "fixed" a correct first row to match it. That bug is why the first row is no longer repaired against the opening alone.

I also caught two bugs in my own generator along the way. Negative balances were printed without the minus, and the image noise wasn't seeded, so two runs never read the same pictures. The first table I made compared different images, so I threw it out.

## Limits

The scans are synthetic: typeset Arial on a white page, with no curled paper, coffee rings, handwriting or other languages. They measure the route and the checks, not accuracy on any real bank's scan. A real scanned statement is the next input I need. The web page still reads only text-layer PDFs. OCR is also slow: about 5 seconds a page on 4 cores. Two tesseract processes sharing those cores slowed to minutes a page, so set `OMP_THREAD_LIMIT=1` if you run several at once.

The code is MIT-licensed in `ventures/ai-bookkeeper` (`ocr.mjs`, `statementtext.mjs`), and the details are in the README under "Scanned statements". This is a bookkeeping tool, not tax or accounting advice. Check every repaired row against the page.
