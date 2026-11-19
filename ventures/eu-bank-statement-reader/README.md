# EU Bank Statement Reader

A free browser tool for anyone handed an ISO 20022 **camt.053** XML or a SWIFT **MT940** bank
statement: **paste or drop it and see each account, its balances and every entry as a table,
check that opening balance plus entries equals the closing balance, and download the entries as
CSV.** The file is read in the browser; nothing is uploaded and no login, bank connection or
API key is needed.

**Live tool:** https://marisstella.app/eu-bank-statement-reader/

After using this, you can now **open a statement you could not read, see which amount makes it
fail its balance check, spot a duplicated entry or a missing statement, and export a clean CSV**,
which used to mean a paid converter or uploading bank data to a stranger's server.

## Input

camt.053 (also 052 and 054) XML, or MT940 text (SWIFT `{1:}{2:}{3:}{4:` envelopes and `-}{5:}`
trailers are stripped from every message in the file, not only the first; two-digit years 70-99
are 19xx). **Element
paths, tag layouts and reversal rules are read from memory of the public formats; no real bank
file or bank validator was available when this was built.**

## Checks

Opening + booked entries = closing (per statement, whole minor units, no floating point);
continuity between consecutive statements of one account; IBAN length and mod-97; dates;
decimals per currency; missing credit/debit indicator; duplicate references; entries in a
different currency; split entries whose parts do not add to the booked total.

## Output

Entries CSV (signed amounts, account masked by default, spreadsheet formula characters
neutralised) and findings CSV.

## Checked against python-stdnum (2026-11-19)

The IBAN table carries all 89 SWIFT IBAN Registry countries, not only SEPA ones, so a statement for, say, a Turkish account no longer warns "country code not in the list this tool knows". Found by the cross-venture identifier oracle, [`platform/ci/id_oracle/`](../../platform/ci/id_oracle/README.md); stdnum is a test-time oracle only, no bank or registry text was read beyond the registry data it carries.

## Run

Open `index.html` through any static server. Tests: `node --test '*.test.mjs'`.

## Differential fuzzing

`mt940-differential.mjs` writes random valid MT940 files whose transactions it knows in advance and
feeds each to the portfolio's three MT940 readers: this one, `ai-bookkeeper/sepa.mjs` and
`mt940-statement-check/calc.mjs`. Twenty variations each switch on one way real exports differ
(several messages per file, `{3:}` headers and `{5:}` trailers, RC/RD reversals, entry dates across
a year end, CR line ends, a BOM, 1990s dates, `:21:`/`:65:` tags, amounts written `12,`). A
`mangle` mode damages the files and only asks that no reader throws.

`node mt940-differential.mjs 3 all 1000` prints each reader's count of wrong reads, errors on valid
input and exceptions. Its first run (2026-11-15) found three bugs here, all fixed: a file holding
several SWIFT messages kept only the first message's statement (787 of 1,000 multi-message files
read wrong, the balance check still passing), a `}` in `:86:` text ended the block early, and
`96xxxx` read as 2096. The other two readers agreed with the generator on every file.
