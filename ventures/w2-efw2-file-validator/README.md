# W-2 EFW2 File Validator

A free browser tool for payroll preparers, bookkeepers and small employers who file W-2s
with the Social Security Administration by wage file: **paste or drop the EFW2 file and see
every structural error with its line number before Business Services Online rejects it,
then rebuild the RT and RF totals after a hand edit.** The file is read in the browser;
nothing is uploaded and no login or API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/w2-efw2-file-validator/

After using this, you can now **find the record that lost its trailing spaces, the SSN that
SSA does not issue, the wage line whose edit left the employer total stale, and the RF count
that no longer matches, and download a corrected file**, which used to mean a rejection
notice and counting columns in a 512-character line by hand.

## Input

One EFW2 file: 512-character records RA, RE, RW, optional RO and RS, RT, optional RU, RF.
CRLF, LF or one unbroken string are accepted. **Field positions are read by position from
memory of the public SSA specification; no SSA validator was available when this was
built.** Only fields whose positions are well known are checked. SSNs are masked to their
last four digits in the report and the findings CSV.

## Checks

Record length and characters; record order; RA resubmission fields; RE tax year and EIN;
RW SSN validity, names and the seven money boxes; Box 1-7 shapes; Social Security wage base
per tax year (2019-2026); Social Security 6.2% and Medicare 1.45% / 0.9% rate sanity; RT
count and sums against the RW lines; RF count; one tax year per file.

## Repair

`repair()` rebuilds RT and RF from the RW lines and lists what changed. It never edits an
RW line: a wrong SSN or amount is a payroll decision, not a typo.

## Run

Open `index.html` through any static server. Tests: `node --test`.
