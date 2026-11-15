# Hungary NAV 3.0: the XSD pass and product fee totals (2026-11-15)

Follows `hungary-nav-samples-2026-11-15.md`, whose "Not done" list named both items.

## 1. The missing schema was in a tag

`invoiceData.xsd` imports `http://schemas.nav.gov.hu/NTCA/1.0/common` without a
schemaLocation. The earlier run looked at nav-gov-hu/Common's main branch, which holds
NTCA 2.0, and stopped. The repository also has a `common-1.0.0` tag (commit
`ab8d788`), and a `release/common-1.0.x` branch, whose
`schemas/src/main/resources/xsd/hu/gov/nav/schemas/NTCA/1.0/common/common.xsd` is
the 1.0 schema (MIT, (c) 2019 NAV, like Online-Invoice).

With `schemaLocation` added to the two imports, xmllint validates:

| set | files | xmllint |
|---|---|---|
| `sample/Data sample` (InvoiceData) | 30 | 30 validate |
| `sample/API sample` (against invoiceApi.xsd) | 11 | 11 validate |
| the three invoices Base64-encoded inside `manageInvoice.xml` | 3 | **3 fail**: `privatePersonIndicator` where 3.0 expects `customerVatStatus` |

So NAV's own API sample wraps invoice data written in the 2.0 shape under the 3.0
namespace. NAV would refuse those three operations with SCHEMA_VIOLATION. The checker
now says so, with the 3.0 replacement in the fix text.

## 2. The schema pass in the checker

`build-nav-schema.mjs` reads the three XSDs (pinned commits, fetched from
raw.githubusercontent.com) into `nav-xsd-data.mjs` (82 complex types, 74 simple types;
facts only, the XSDs are not copied). `nav-xsd.mjs` validates against it with the
content-model matcher `fa3-xsd.mjs` uses, plus a namespace check: a NAV file mixes
three namespaces, and `<countryCode>` in the data namespace instead of
`<base:countryCode>` is a schema error xmllint reports, so the tree used here keeps
each element's namespace. Rules HU-027..HU-032 (blocking, NAV SCHEMA_VIOLATION).

Differential against xmllint (`node eval/nav-xsd-diff.mjs <Online-Invoice clone> <Common clone at common-1.0.0>`),
seeds = NAV's 30 samples, one leaf-level fault per mutant:

```
seed 1, --per 44:  1162 mutants; xmllint rejects 1043; agree 1162 (100.0%)
seed 2, --per 110: 2867 mutants; xmllint rejects 2562; agree 2867 (100.0%)
seed 3, --per 110: 2880 mutants; xmllint rejects 2568; agree 2880 (100.0%)
```

Per kind (seed 1): delete 120 (87 rejected), duplicate 120, unknown element 120, swap
with neighbour 120, namespace moved 120, empty 120, 600 extra characters 120, text in
place of the value 120 (98 rejected), `-1` 120 (59 rejected), 12 decimal places 77
(74 rejected), month 13 5. No disagreement in any direction. The faults are generated
mechanically, so this measures that the validator agrees with xmllint on NAV's schema,
not what real invoicing programs get wrong; whole-block deletions and attribute faults
were not seeded.

## 3. Product fee (termékdíj) totals

The earlier write-up said Annex I (the warning descriptions) was not in the repository.
It is: the English specification PDF dated 2026.02.12 carries it from about page 300
(`pdftotext -layout`). Its product fee entries were read and implemented as HU-033
(warnings, as NAV issues them):

| NAV id | code | check |
|---|---|---|
| 270 | INCORRECT_PRODUCT_CODE_FEE_CATEGORY | a line's product fee code type is CSK or KT |
| 280 | INCORRECT_PRODUCT_CODE_FEE_SUMMARY_CATEGORY | the same on summary rows |
| 290 | INCORRECT_PRODUCT_CODE_FEE_CATEGORY_MISSING | every line code type appears in the summary |
| 450 | MISSING_PRODUCT_FEE_DATA_LINE_OBLIGATED_CONTENT_EMPTY | obligatedForProductFee true needs line content |
| 460 | MISSING_PRODUCT_FEE_DATA_LINE_OBLIGATED_SUMMARY_EMPTY | obligated lines need a summary |
| 470 | MISSING_PRODUCT_FEE_DATA_LINE_CONTENT_SUMMARY_EMPTY | line content needs a summary |
| 471, 670 | MISSING_LINE_PRODUCT_FEE_CONTENT, INCORRECT_PRODUCT_FEE_DATA_CHARGE_SUM | a summary needs line content |
| 480 | MISSING_PRODUCT_FEE_DATA_LINE_QUANTITY_SUMMARY_QUANTITY | quantities by code, lines vs summary |
| 490 | MISSING_PRODUCT_FEE_DATA_LINE_MEASURING_SUMMARY | KG / DARAB by code, lines vs summary |
| 651 | INCORRECT_PRODUCT_FEE_DATA_OBLIGATED_LINE | line content needs obligatedForProductFee true |
| 780 | INCORRECT_PRODUCT_FEE_CALCULATION_PRODUCT_FEE_AMOUNT | summary quantity x rate = amount |
| 790 | ..._AGGREGATE_PRODUCT_CHARGE_SUM | productChargeSum = the lines' amounts |
| 810 | ..._PRODUCT_FEE_AMOUNT_SUMMARY | summary amount by code = the lines' amounts |

Tolerance is the one Annex I gives for 780-810: 1% of the HUF value, at least 1 HUF or
0.01 of the invoice currency, whichever is greater. On modifications only
`lineOperation` CREATE lines are summed (as 480, 490, 790 and 810 say). Not done:
260 (INCORRECT_PRODUCT_CODE_FEE_WEIGHT, mostly covered by 270) and the customer
declaration / takeover warnings (INCORRECT_PRODUCT_FEE_DATA_CUSTOMER_TAXPAYERID and the
takeover reason codes). With two summaries (REFUND and DEPOSIT) a line does not say
which it belongs to, so the line-to-summary comparisons are skipped and listed.

NAV publishes one product fee sample (`Termekdijas szamla.xml`, two lines, three KT
codes, a DEPOSIT summary); it gets no finding. `hungary-nav-product-fee.test.mjs`
seeds one fault per code into it (8 tests). No real business's product fee invoice
was read.

## Not done

- A real report with NAV's `businessValidationMessages` (unchanged from the earlier run).
- The remaining Annex I families were not re-read against HU-020..026, which were
  written from the code names; that is now possible from the same PDF.
