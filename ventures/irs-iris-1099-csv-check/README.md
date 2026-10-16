# IRS IRIS 1099 CSV Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/irs-iris-1099-csv-check/>

A free browser tool for bookkeepers, tax preparers and small filers moving from FIRE to IRIS:
**paste or drop the 1099-NEC / 1099-MISC bulk-upload CSV and see every problem with its line
number before you upload, then download a cleaned copy.** The file is read in the browser;
nothing is uploaded and no login or API key is needed. Independent of the IRS.

After using this, you can now **find the row with a TIN that lost its leading zero, the SSN in
a never-issued range, the state written out as "Texas", the amount that says `$4,200.00`, the
recipient filed twice, and the record count that does not match your payment list, and get a CSV
with the mechanical faults fixed**, which used to mean a rejected upload or a later CP2100 notice.

**Unverified:** every rule is from memory of public IRS IRIS template / Pub 5717-style guidance.
No IRS template or IRIS account was available. See `VENTURE.yaml` for the list.

## Checks

Header names, duplicates and missing columns; delimiter; unterminated quotes; cell counts;
Form Type; tax year; payer and recipient TIN shape, SSN/ITIN/EIN ranges, placeholders; names,
addresses, state codes, ZIPs; money format; filing thresholds; withholding; duplicate rows and
recipients; totals and record counts against numbers you type in.

## Safe fixes

`repair()` changes only delimiter, header capitals, stray spaces, TIN dashes, state and form
capitals, a lost ZIP zero in zero-ZIP states, and `$`/commas in amounts, and lists every change.
It never changes a name, an address or an amount's value.

## Run

Open `index.html` through any static server. Tests: `node --test`.
