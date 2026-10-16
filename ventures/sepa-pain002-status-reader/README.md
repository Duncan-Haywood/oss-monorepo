# SEPA pain.002 Status Reader

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sepa-pain002-status-reader/>

A free browser tool for anyone who uploads SEPA payment files to a bank: **paste or drop the
pain.002 status report the bank sends back and see which payments were accepted or rejected,
what each reason code means and what to do about it, the rejected total, and a list of the
rejected payments to fix.** The file is read in the browser; nothing is uploaded and no login,
bank account or API key is needed.

After using this, you can now **tell that INV-1002 failed because the payee's account is closed
(AC04), INV-1003 because you were short of funds (AM04), and that three payments worth 5,850.00
EUR need action**, which used to mean reading a status XML and a bank's code list by hand.

## Input

One `pain.002` XML file (`CstmrPmtStsRpt`), UTF-8 or Windows-1252. `pain.002.001.03` is the version
it was written against; later versions are read by the same element names. **The status and
reason-code tables (about forty ISO external codes) are from memory of public sources; no bank
documentation was available when this was built, and banks add private codes**, which are shown as
unknown rather than guessed. IBANs are masked in the report and the CSVs.

## What it reports

Status of the file, each payment block and each payment (ACTC, ACCP, ACSP, ACSC, ACWC, PART, PDNG,
RJCT and others); every reason code with meaning, kind of fix and action; rejected payments grouped
by reason and by kind of fix with exact-decimal totals; a count check against the original file and
each block's own counts; duplicate EndToEndId; a rejected-payments CSV. A DTD is refused and never
expanded. It never edits or sends anything.

## Run

Open `index.html` through any static server. Tests: `node --test`.
