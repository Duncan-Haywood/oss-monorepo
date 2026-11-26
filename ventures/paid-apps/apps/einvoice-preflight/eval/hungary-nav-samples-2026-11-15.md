# Hungary NAV Online Számla 3.0: the checker on NAV's own samples (2026-11-15)

Source: [nav-gov-hu/Online-Invoice](https://github.com/nav-gov-hu/Online-Invoice), cloned
`--depth 1` on 2026-11-15 (MIT, (c) 2019 Nemzeti Adó- és Vámhivatal). Read for the rules:
the English interface specification "EN_Online Invoice System 3.0 Interface Specification
(2026.02.12.).pdf", section 3.3.2 (blocking validation codes 1-80 with their actions) and
3.3.3 (warnings, and the tolerance sentence), plus `invoiceData.xsd` for names and enums.

## 1. The 30 InvoiceData samples (`sample/Data sample`)

`checkNavInvoice` on each file, unmodified:

| result | files |
|---|---|
| no finding | 27 |
| findings | 3 (5 findings) |

Every one of the five was checked by hand against the file, and each is a real fault in
NAV's sample by NAV's current rules:

| file | rule | what is in the file |
|---|---|---|
| Belfoldi ertekesites tobb AFA tipus.xml | HU-023 (warning) | the 18% row: `vatRateGrossAmount` 306800.00 but `vatRateGrossAmountHUF` 3068000.00 on a HUF invoice (an extra zero) |
| Belfoldi ertekesites tobb AFA tipus.xml | HU-025 (warning) | the domestic reverse-charge row: net 600000.00, VAT 0, gross 500000.00 |
| Belfoldi termekertekesites AFA csoportok kozott.xml | HU-018 x2 | taxpayerIds 98765432 and 87654321 fail the 9-7-3-1 check digit (placeholders; the other samples use valid 99999999 / 99887764) |
| Teteladatok modositasa.xml | HU-017 | `lineOperation` MODIFY; code 60 (INVALID_LINE_OPERATION) now takes only CREATE (the sample predates the rule) |

Two false findings were found and fixed during the run: (a) `LITER` was flagged because the
spec's English text lists the unit as "LITRE" while the XSD enum and the samples say `LITER`
(the XSD wins); (b) per-rate VAT sums were compared when a line had no `lineVatData`
(optional; advance-deduction lines omit it), which flagged four samples. Both are fixed and
covered by the samples in the test.

## 2. The manageInvoice sample (`sample/API sample/manageInvoice.xml`)

Three CREATE operations, `completenessIndicator` true, each with an `electronicInvoiceHash`
(SHA3-512). The spec (code 28) says the hash is "the all-caps hash value of the BASE64
encoded value of the invoiceData node". Computed four ways:

| hashed bytes | algorithm | matches the sample |
|---|---|---|
| the decoded InvoiceData XML | SHA3-512 | 3 of 3 |
| the Base64 text | SHA3-512 | 0 of 3 |
| the decoded XML / the Base64 text | SHA-256 | 0 of 3 |

So the checker hashes the decoded bytes, and says why in a comment. The sample's placeholder
data uses `vatPercentage` 0.25 on a 2020 delivery; NAV's code-14 list takes 0.25 only on
modifications or supplies before 2013, so those six HU-005 findings are correct by the rule.
Compressed operations (`compressedContent` true) are listed under `skipped`, not read.

## 3. Seeded faults

`node eval/hungary-nav-mutations.mjs "<clone>/sample/Data sample"`: 27 fault kinds, each
applied once to every sample where it applies (519 mutants). A mutant counts as caught when
a finding of the expected rule appears that the untouched file did not have.

```
samples: 30 (27 with no finding, 5 findings on the untouched files)
mutants: 519; expected rule reported: 518 (99.8%); any new finding: 518 (99.8%)

mutation	applied	caught
line net +10%	26	26
line VAT +10%	20	20
line net HUF x10	26	26
line gross +10%	20	20
invoice net total +10%	29	29
invoice VAT total +10%	29	29
invoice gross total +10%	29	29
rate row net +10%	29	29
EUR rate given per 100 HUF	5	5
vatPercentage 0.25 (pre-2013) on a new invoice	17	17
vatPercentage 0.21 (not Hungarian)	26	26
vatContent on a normal line	23	23
OWN unit without unitOfMeasureOwn	5	5
unknown unit LITRE	26	26
second line numbered 1	19	19
quantity dropped on an expressed line	26	26
private person keeps customerName	29	29
supplier taxpayerId digit changed	30	29
invoice number with trailing space	30	30
file cut off half-way	30	30
simplified line gross +10%	1	1
HUF invoice with rate 1.1	25	25
exemption case lower-case	5	5
delivery period reversed	2	2
aggregate line loses aggregateInvoiceLineData	2	2
exempt line given VAT	3	3
modifying line loses lineModificationReference	7	7

not caught by the expected rule:
  supplier taxpayerId digit changed @ Belfoldi termekertekesites AFA csoportok kozott.xml: new findings -
```

The one miss is expected: that sample's supplier tax number already fails the check digit,
so changing a digit leaves the same finding.

A first run seeded amounts with +500 and caught 77%: on lines of 100,000 HUF and more that is
under NAV's tolerance (1% of the amount, at least one unit), so NAV would not warn either.
The seeded change is now 10% + 2 units. The same author wrote the rules and the mutations, so
this measures that each rule fires on its fault, not what real software gets wrong.

## Not done

- No real business's report, and no NAV response (`/queryTransactionStatus` with its
  `businessValidationMessages`) to compare a verdict with. That is the next measurement.
- Annex I (the full WARN descriptions) is not in the repository; the WARN arithmetic is written
  from the code names and the tolerance sentence, not NAV's formulas.
- No XSD validation: `invoiceData.xsd` imports the `NTCA/1.0/common` schema, which is not in
  this repository (nav-gov-hu/Common holds 2.0), so xmllint could not be run against the samples.
- Product-fee (`productFeeSummary`, "termékdíj") arithmetic, VAT-group rules beyond the check digit,
  and the 2013 rate cut-over on aggregate invoices are not checked.
