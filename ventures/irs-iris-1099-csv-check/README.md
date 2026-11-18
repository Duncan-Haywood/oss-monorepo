# IRS IRIS 1099 CSV Check

A free browser tool for bookkeepers, tax preparers and small filers moving from FIRE to IRIS:
**paste or drop the 1099-NEC / 1099-MISC bulk-upload CSV and see every problem with its line
number before you upload, then download a cleaned copy.** The file is read in the browser;
nothing is uploaded and no login or API key is needed. Independent of the IRS.

**Live tool:** https://marisstella.app/irs-iris-1099-csv-check/

After using this, you can now **find the row with a TIN that lost its leading zero, the SSN in
a never-issued range, the state written out as "Texas", the amount that says `$4,200.00`, the
recipient filed twice, and the record count that does not match your payment list, and get a CSV
with the mechanical faults fixed**, which used to mean a rejected upload or a later CP2100 notice.

**Column layout (2026-11-10):** the checker now reads the IRS IRIS Taxpayer Portal template's own
header row, tax year 2025: 54 columns (A-BB) for the 1099-NEC and 64 (A-BL) for the 1099-MISC
(`TEMPLATE_NEC`, `TEMPLATE_MISC` in `calc.mjs`). Before this, it used a shorter layout written
from memory (`Payer TIN`, `Recipient Name`, ...), so **a correctly filled IRS template failed with
ten "required column is missing" errors**. The template was not read on irs.gov (blocked from
where this was built, and the portal hands the file out behind its login); the header text was
cross-checked in four independent open-source projects that say they follow the template or its
formatting guidelines (ubukhari/iris-1099, christcr2012/appliance-desk, techmore/rupert,
Tyler-LeDuc/leducsystems). Where they differ (`Last Name` with or without `(Surname)`, a `*` on
required columns, the 1099-MISC `FATCA Filing Requirements` and `Box 14` columns) every spelling is
accepted. The old layout is still read as a fallback.

**Checked on irs.gov (2026-11-11):** the IRS's own TY2025 IRIS CSV template formatting guidelines
(irs.gov/pub/irs-efile/ty2025-template-formatting-guidelines.zip, linked from "E-file information
returns with IRIS") list every column by letter; both layouts above match them, and the 1099-MISC has
`FATCA Filing Requirements` in AK and no Box 14 column. For tax year 2026 the 1099-MISC reporting
amounts come from the Instructions for Forms 1099-MISC and 1099-NEC (Rev. December 2026): $2,000 for
rents, other income, medical payments, crop insurance, 409A deferrals and nonqualified deferred
compensation; $600 for attorney proceeds and fish for resale; $10 for royalties and substitute
payments. Earlier years keep the amounts below.

**Unverified:** every other rule (limits, pre-2026 thresholds, accepted values for Name Type, TIN Type and
the check-box columns, the 100-record file limit) is from memory or from those open-source
readings. No IRS template or IRIS account was available. See `VENTURE.yaml` for the list.

## Template checks

Detected when the header has two or more template-only columns. Missing template columns (a
warning: IRIS checks the header row against its template) and missing TIN, address and form columns
(errors); columns out of the template's order; one form per file; Payer and Recipient TIN Type on
every row; Name Type B with Business or Entity Name Line 1, or I with first and last name; Y/N
check-box columns; State 1 and State 2 codes; a foreign Recipient Country skips the US state and
ZIP rules; more than 100 records in one upload. Findings and safe fixes name the template's
columns.

## Checks

Header names, duplicates and missing columns; delimiter; unterminated quotes; cell counts;
Form Type; tax year; payer and recipient TIN shape, SSN/ITIN/EIN ranges, placeholders; names,
addresses, state codes, ZIPs; money format; filing thresholds; withholding; duplicate rows and
recipients; totals and record counts against numbers you type in.

## Safe fixes

`repair()` changes only delimiter, header capitals, stray spaces, TIN format (dashed as the IRS template guidelines require for the row's TIN type), state and form
capitals, a lost ZIP zero in zero-ZIP states, and `$`/commas in amounts, and lists every change.
It never changes a name, an address or an amount's value.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Known gaps

From the quality audit of 2026-11-12
([`portfolio/quality/audits/2026-11-12-irs-iris-1099-csv-check.json`](../../portfolio/quality/audits/2026-11-12-irs-iris-1099-csv-check.json)),
checked against the IRS TY2025 IRIS template formatting guidelines. Fixed in the same PR: TINs are now
checked and written in the dashed format the guidelines require (the old safe fix stripped the dashes),
QI-EIN and UND are accepted TIN types, and FM, MH and PW are accepted state codes. Still open:

- A row with Box 1 blank and Box 2 (direct sales of $5,000 or more) = Y is reported as having no reportable amount; the guidelines accept either.
- The CF/SF column is read as a Y/N flag; the guidelines define it as a quoted list of states (for example `"AL,CA,DE"`).
- Name and address character rules differ from the guidelines: business names allow `.`, `,` and `/` the guidelines forbid and warn on `#` and parentheses they allow; first and last names (20 characters) and city (letters only) are not checked; the address limit is 40 rather than 35.
- ZIP: `12345-6789` passes although the guidelines ask for digits only, and a 12-digit foreign postal code is rejected.
- Payer TIN Type accepts ITIN and ATIN (only EIN and SSN are listed), and Recipient TIN Type `NONE` hides a blank TIN.
