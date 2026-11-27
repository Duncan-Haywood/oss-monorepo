# Hungary NAV 3.0: HU-020..026 re-read against Annex I (2026-11-15)

Follows `nav-product-fee-2026-11-15.md`, whose "Not done" list said the VAT arithmetic
(HU-020..026) had been written from NAV's warning code names, not from Annex I, and that
Annex I was now readable in the same PDF.

Source: nav-gov-hu/Online-Invoice (MIT), `docs/API docs/en/EN_Online Invoice System 3.0
Interface Specification (2026.02.12.).pdf`, Annex I sections I.3 and I.4, read with
`pdftotext -layout`. Each warning gives a formula, an "only runs if" condition, a scope
table (CREATE/MODIFY/STORNO by NORMAL/SIMPLIFIED/AGGREGATE) and a tolerance sentence.
59 warnings in the calculation, summary-data and type-mismatch families; 3 are product
fee (HU-033, done earlier) and 2 are marked inactive (690, 700), leaving 54.

## What was wrong

| What the code did | What Annex I says | Now |
|---|---|---|
| Cited `INCORRECT_LINE_CALCULATION_VAT_AMOUNT` for line VAT = net x rate | No such warning; NAV never checks a line's VAT against its rate | Kept as our own check, `nav: null`, the message says NAV accepts it silently |
| Cited `INCORRECT_LINE_CALCULATION_GROSS_AMOUNT` for a normal line's gross = net + VAT | That code (750) is the simplified line's quantity x price; the normal line is checked only in forints (754) | Currency check labelled ours; 754 added |
| Cited `..._VAT_RATE_GROSS_AMOUNT`, `..._VAT_RATE_VAT_AMOUNT_LINE`, `..._DATA_INVOICE_VAT_RATE_GROSS_AMOUNT_HUF` | None exist (the first was phased out in 1.1) | Labelled ours |
| `..._VAT_RATE_VAT_AMOUNT`, `..._VAT_RATE_VAT_AMOUNT_HUF_SUMMARY` (invoice total), `..._INVOICE_GROSS_AMOUNT(_HUF)` | Renamed: 890 `..._VAT_RATE_VAT_AMOUNT_SUMMARY`, 860 `..._INVOICE_VAT_AMOUNT_HUF_SUMMARY`, 880/881 `..._INVOICE_GROSS_AMOUNT(_HUF)_SUMMARY`; simplified totals are 930/931 `..._INVOICE_VAT_AMOUNT(_HUF)` | Names corrected |
| Tolerance: 1%, never less than 1 unit of the invoice currency | 1% of a named reference, at least 1 HUF or 0.01 units of the invoice currency, whichever is greater | On a EUR invoice the floor drops from 1.00 EUR to 0.01 EUR; on forint amounts it is max(1 HUF, 0.01 x rate); each warning's reference (computed or stated) as Annex I names it |
| A line with `lineDiscountData` skipped the net check | 740/750 subtract `discountValue`, or quantity x price x `discountRate` | Checked with the discount |
| Row-against-lines (820/821) and row VAT (890) ran on zero rows | "Only runs if the VAT base is not zero" | Skipped on a zero base |
| 860 ran whenever the total was there | Only runs if the rows give `vatRateVatAmountHUF` | As NAV says |

## Added (21 warnings)

754 (line forint gross = forint net + VAT), 891 (row forint VAT from forint net), 941
(lines' forint nets = forint net total), 1073 (gross total x rate, normal and simplified),
1090 and 1100 (a CREATE invoice's net, or simplified gross, total negative), 900 and 901
(simplified lines' gross = invoice gross, and in forints), 921 (simplified lines' forint
gross by VAT content = the row), 680, 710, 720, 733 (a rate or marker in the summary that no
line carries), 910-914 and 916 (the same on simplified summaries), 711 and 731 (a
reverse-charge or margin-scheme row with VAT; 731's condition names
"utilitySettlementIndicator values <> TRAVEL_AGENCY", a marginSchemeIndicator value, so
that field is read). 734 and 1072 were already checked and now carry their names.

All 54 active warnings in these families are now implemented. Each HU-020..026 finding has
a `nav` field: the Annex I code, or `null` for the five checks NAV does not make.
`hungary-nav-annex1.test.mjs` (18 tests) holds the Annex I code list and fails if the module
cites a calculation code that is not on it.

## Measured

NAV's 30 InvoiceData samples (`eval/hungary-nav-mutations.mjs "<clone>/sample/Data sample"`):
unchanged, 27 with no finding and the same 5 findings in 3 files. The tighter EUR floor
added nothing on NAV's 5 foreign-currency samples.

Mutants: the 519 earlier ones give the same verdicts (518 caught). Six new mutation kinds
aimed at the new warnings added 114 mutants, 106 caught by the expected rule. The 8 misses
are all cases where Annex I says the warning does not run:

- a forint gross bumped on a domestic reverse-charge line with no `lineVatData` (754 needs
  all three amounts; the conversion check HU-023 still catches it);
- a forint VAT bumped on an exempt or out-of-scope row (891 runs on rated rows; HU-010 catches
  it as VAT on an exempt row);
- an extra 18% summary row on three modifications whose lines carry no `lineAmountsNormal`
  ("In case of MODIFY, only runs if the node lineAmountsNormal exists").

Totals: 633 mutants, 624 caught by the expected rule, 629 with some new finding.

## Not done

- No real business's report with NAV's `businessValidationMessages` to compare verdicts
  with (unchanged): the checks follow NAV's written definitions, not observed NAV replies.
- 731's condition is read as marginSchemeIndicator; the text names a field that does not
  exist in 3.0.
- The I.1 / I.2 families (head data, dates, tax numbers, product codes) were not re-read
  in this pass.
