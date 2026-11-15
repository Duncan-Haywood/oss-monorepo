# Hungary NAV 3.0: product fee totals (2026-11-15)

Follows `hungary-nav-samples-2026-11-15.md`, whose "Not done" list named product fee
arithmetic and said Annex I was missing.

## Product fee (termékdíj) totals

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
- The schema gate (HU-027..032) landed separately the same day in PR #16156
  (`eval/hungary-nav-xsd-2026-11-15.md`). This run built the same gate in parallel
  (6,909 mutants agreeing with xmllint over three seeds) and dropped it in favour of
  the one on main.
