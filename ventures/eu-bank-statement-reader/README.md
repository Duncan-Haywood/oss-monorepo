# EU Bank Statement Reader

A free browser tool for anyone handed an ISO 20022 **camt.053** XML or a SWIFT **MT940** bank
statement: **paste or drop it and see each account, its balances and every entry as a table,
check that opening balance plus entries equals the closing balance, and download the entries as
CSV.** The file is read in the browser; nothing is uploaded and no login, bank connection or
API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/eu-bank-statement-reader/

After using this, you can now **open a statement you could not read, see which amount makes it
fail its balance check, spot a duplicated entry or a missing statement, and export a clean CSV**,
which used to mean a paid converter or uploading bank data to a stranger's server.

## Input

camt.053 (also 052 and 054) XML, or MT940 text (a SWIFT `{4:` envelope is stripped). **Element
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

## Run

Open `index.html` through any static server. Tests: `node --test`.
