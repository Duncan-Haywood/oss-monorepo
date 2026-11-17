---
title: "A Bank Statement That Misprints Its Own Balance"
seo_title: "Bank Statement PDF to CSV: Misprinted Balances and Split Dates"
date: 2026-11-14
tags: [bank-statement-pdf-to-csv, pdf, bookkeeping, testing]
description: "Six rows of a test statement were still wrong. Glyph widths, whole-number balances, an end marker and a misprint check took it from 56 to 62 of 62 rows."
---

The [statement PDF to CSV converter](/bank-statement-pdf-to-csv/) checks its own work. Opening balance plus every row must equal the closing balance, and each row is checked against the running balance printed next to it. Three days ago it was [measured on statements it did not write](/posts/2026-11-11-a-statement-reader-meets-statements-it-did-not-write/). One file from another open-source parser, transtractor, was left at 56 of 62 rows right, with the running balance broken.

This round went through those six rows line by line. The 62-row count turned out to be luck. Three real rows were missing, and three rows from a decoy page after the statement's last line had taken their place.

## What the file does on purpose

The fixture is built to trip parsers up, and each trap shows up in real statements too:

- **A date printed in pieces.** "13 Jan" is drawn as three separate bits of text: `1`, `3 J` and `an`. The reader saw three words and found no date, so the row merged into the row above it.
- **A round balance with no decimals.** `90,350 CR` instead of `90,350.00 CR`. It wasn't read as money, so the row's amount ran into its description.
- **A page after the end.** After "Transactions stop here." there's a third page that repeats four rows.
- **A balance that is simply wrong.** One row prints `3978.53 CR`. The rows before it reach 73,978.53, and the next printed balance follows on from 73,978.53.
- **A description printed above its amount**, on a line by itself.

## Four general rules, not four special cases

1. **Glyph widths from the font.** A PDF font carries the width of every glyph (`/Widths`, or `/W` for composite fonts). The reader used to guess half the font size per letter, so it couldn't tell whether two bits of text touched. It now reads the real widths and joins two bits only when both widths are known and the gap is under a fifth of the font size. Column gaps are many times that. Fonts that don't carry widths are never joined.
2. **A whole number tagged CR or DR is money.** A bare `90,350` still isn't, because a reference number or a year can look like that.
3. **"Transactions stop here", "End of transactions"** end the table. Dated lines after one are left out with a note, until a new account's title starts another table.
4. **A misprint is not a missing row.** Before, the tool said "a row is probably missing" at the bad balance, then reported a second break where the next balance was measured against the misprint. Now it checks whether the next printed balance follows on from the rows. If it does, the finding says the statement's own figure looks misprinted and is off by 70,000.00, as a warning rather than an error, and the knock-on break goes away. A real missing row still reads as a break (there's a test for each case).

For descriptions, the spacing decides. In this file, lines of one transaction sit 13.8 points apart and separate transactions at least 14.8 apart. A line with no amount now goes with the row it sits closer to, but only when the widest gap clearly stands out. Evenly spaced lines, which most statements have, stay with the row above, as before.

## Result

| | rows right (date and signed amount) | proved |
|---|---|---|
| before | 56 of 62 | no, two errors |
| after | **62 of 62** | **yes**, with one misprint warning |

The same repository has a second fixture, `test1a.pdf`, that was never opened while these fixes were written. Before: 63 rows, with the balances 37,630.00 apart. After: 62 rows, and opening plus rows equals the closing balance. It has no truth file, so the proof is the only claim. The five benchmark statements and the 100-row ICICI sample read the same as before.

What still hasn't been measured is a real customer's statement from a real bank. If you have one with the private details blacked out, the [feedback form](/feedback/) is the way to send what went wrong. The PDF never leaves your browser when you use the tool itself.

Method and numbers: `ventures/bank-statement-pdf-to-csv/eval/README.md`, "Round 2".
