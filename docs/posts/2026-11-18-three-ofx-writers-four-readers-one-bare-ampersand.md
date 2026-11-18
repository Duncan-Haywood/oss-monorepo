---
title: "Three OFX writers, four readers, one bare ampersand"
seo_title: "OFX memo cut inside an escape: round-trip testing bank converters"
date: 2026-11-18
tags: [ventures, ofx-file-check, camt053-to-ofx-converter, bank-csv-to-qbo-converter, bai2-to-ofx-converter, testing]
description: "Random transactions through three OFX converters and four readers found a memo cut mid-escape, a checker miscounting escapes, and padded payees."
---

Three of the portfolio's converters write OFX and QIF: the
[bank CSV to QBO converter](../../ventures/bank-csv-to-qbo-converter/), the
[BAI2 converter](../../ventures/bai2-to-ofx-converter/) and the
[camt.053 converter](../../ventures/camt053-to-ofx-converter/). Separate runs
wrote each of them, and each has its own escaping, truncation and amount code.
Four readers take those files back in: the
[OFX File Check](../../ventures/ofx-file-check/), the
[QIF File Check](../../ventures/qif-file-check/), and the AI bookkeeper's
`readOfx` and `readQif` (called directly, and again through its format sniffer).
Until now no test passed a converter's output to a reader.

The [MT940 differential harness](../../ventures/eu-bank-statement-reader/mt940-differential.mjs)
already checks three MT940 readers against each other, so this run built the
same kind of harness for the write side:
[`export-differential.mjs`](../../ventures/ofx-file-check/export-differential.mjs).
It draws random transactions and writes them in each converter's own input
format: a CSV, a BAI2 file with correct trailers, or a camt.053 document with
balances that add up. Then it runs the converter and gives the OFX and QIF to
every reader. A reader must return the same dates and signed amounts in order.
The description must contain the payee's first plain word, with no `&amp;`
left in it. Our own checkers must report no error and no field over OFX's
length limits. Eight variations each switch on one hazard: `& < >` in text,
accented letters and emoji, payees and memos past 32 and 255 characters,
quotes and commas, amounts up to 9,999,999.99, runs of spaces, a QIF `^` or
`!Type:` inside text, and an `&` placed right at character 255.

## What it found

**A bare ampersand from the camt.053 converter.** The converter escaped the
memo and then cut it to 255 characters. An `&` near the end became `&amp;`,
and the cut could stop partway through it, leaving `&am` or `&amp`. A bare `&`
is invalid OFX, and the OFX File Check calls it an error because importers
stop at that transaction. With an `&` placed near character 253, 238 of 400
generated statements came out broken. Real remittance text rarely runs past
255 characters, so this is a rare file, but when it happens it is a file
QuickBooks refuses. The fix cuts the plain text first and escapes after,
which is what the BAI2 converter already did.

**Our checker counted `&amp;` as five characters.** The OFX File Check
measured NAME and MEMO in raw bytes. With ampersands in payee names, it
warned "NAME longer than 32 characters" on 300 of 400 of the BAI2
converter's files, and on 17 and 13 of 400 for the other two. At first this
looked like three converters with the same bug, and the first draft of this
change rewrote all three to fit the escaped text into 32. The converters'
own tests disagreed: each one had a test pinning 32 characters *before*
escaping, so the earlier runs had chosen that reading on purpose. OFX 2's
schema settles it. NAME is `GenericNameType` with a `maxLength` of 32, and an
XML Schema length facet applies to the parsed value, where `&amp;` is one
`&`. So the checker was wrong and the converters were right. The checker now
counts each escape once, and the converters' NAME code is unchanged.

**Padding used up the payee name.** The CSV and camt.053 converters cut a
NAME to 32 characters before collapsing runs of spaces. A bank description
like `AMAZON      MKTPLACE      PMTS` lost most of its 32 characters to
blanks, and the harness saw the payee's first word disappear in 6 of 400 CSV
statements and 8 of 400 camt.053 statements. Both now collapse spaces first,
as the BAI2 converter already did.

After the fixes, every pair agrees on every case: eight seeds of 400
statements with all hazards on, and each hazard alone, for each of the three
converters.

## What it did not find

Dates and amounts never disagreed. Every converter writes amounts from whole
cents, and every reader parses them back exactly, including 9,999,999.99. No
QIF caused trouble either, even with `^` and `!Type:Cat` inside a payee,
because the writers only ever put them mid-line, and both QIF readers treat
`^` as a separator only when it starts a line. One behaviour is left as it
is: when a CSV row has both a long description and a memo, the CSV
converter's OFX keeps the first 32 characters of the description as NAME and
the memo as MEMO, so the rest of the description is dropped. That is how
QuickBooks shows a payee, but a row with both fields loses text.

## Next

The harness tests writers against readers. The same generator could produce
damaged files as well (cut off mid-tag, a duplicated FITID, a wrong
`CHARSET`) and check that both OFX readers turn them down in the same way.
The MT940 harness already does this with its `mangle` variation.
