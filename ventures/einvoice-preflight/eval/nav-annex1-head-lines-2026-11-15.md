# Hungary NAV 3.0: Annex I sections I.1 and I.2 read warning by warning (2026-11-15)

Follows `nav-annex1-calculations-2026-11-15.md`, whose "Not done" list said the I.1 / I.2
families (head data, dates, tax numbers, product codes, line data) had not been re-read.

Source: nav-gov-hu/Online-Invoice (MIT), `docs/API docs/en/EN_Online Invoice System 3.0
Interface Specification (2026.02.12.).pdf`, Annex I sections I.1 ("Warnings related to invoice
header data", from page 237) and I.2 ("Warnings for data in line items", from page 268), read
with `pdftotext -layout`. Each warning gives an ID, a code, an "Operation" (what it checks and
when it runs), a scope table (CREATE/MODIFY/STORNO by NORMAL/SIMPLIFIED/AGGREGATE) and,
for some, a comment ("Inactive", "Deprecated from version 3.17 onward").

## Before this pass

None of I.1's 34 active warnings was checked by its own definition (a first count matched two
I.1 date codes by prefix; the module was in fact checking a delivery period's order and a
5-year delivery limit, which are blocking codes). Of I.2's 35 active warnings, 18 were in: the
calculation codes re-read in the earlier pass (740-754, with 742, 744, 746 and 752 built from an
`AGGREGATE_` infix) and the type mismatches 980 and 1000. The same prefix count had also shown
595, 631, 5810 and 5820 as covered; they were not.

## What a file can show, and what it cannot

| Annex I | Code | Here | Why |
|---|---|---|---|
| 10 | SUPPLIER_CUSTOMER_MATCH_TAXPAYER | HU-034 | first 8 digits equal |
| 20 | SUPPLIER_CUSTOMER_MATCH_BANKACCOUNT | HU-034 | only for customerVatStatus OTHER, as Annex I says |
| 30, 40 | SUPPLIER_FISCAL_MATCH_TAXPAYER, _NAME | HU-034 | |
| 530 | INCORRECT_HEAD_DATA_FISCALREPRESENTATIVE | HU-034 | fiscal representative with a seller county code other than 51 |
| 50, 100 | INCORRECT_VAT_CODE_SUPPLIER, _FISCALREPRESENTATIVE | HU-034 | value sets 1/2/3/5 and 1/2/4 |
| 82 | INCORRECT_HEAD_DATA_CUSTOMER_GROUPMEMBER_TAXNUMBER | HU-034 | NAV's text: a group id "starting with 177" in the member slot; "will soon become an ERROR" |
| 120-160 | INCORRECT_COUNTY_CODE_* (five) | HU-034 | list 02-20, 22-44, 51 |
| 200 | INCORRECT_COUNTRY_CODE_FISCALREPRESENTATIVEADDRESS | HU-034 | not HU |
| 500 | INCORRECT_HEAD_DATA_SUPPLIER_COMMUNITY_VAT_NUMBER | HU-034 | EU VAT number's last 8 against the tax number |
| 313 | INCORRECT_DATE_INVOICE_DELIVERY_DATE_LATE | HU-034 | 397 days or more after issue |
| 320 | INCORRECT_DATE_AGGREGATE_INVOICE_ISSUE_DATE | HU-034 | AGGREGATE, CREATE and MODIFY |
| 321 | INCORRECT_DATE_AGGREGATE_INVOICE_DELIVERY_DATE | HU-034 | AGGREGATE, CREATE only |
| 310, 312, 340, 341 | issue date in the future (5 days), delivery in a lapsed period (before 1 January of the sixth year back), modifying document in the future (5 days) or 15+ days old | HU-034 | need the day of reporting: a manageInvoice request's `header/timestamp` (read in Budapest time) wins; else the caller's `reportDate`; the page passes today in Budapest; a bare file through the library without one lists them in `skipped` |
| 561 | INCORRECT_HEAD_DATA_PERIODICAL_SETTLEMENT | HU-034 | period dates without periodicalSettlement true |
| 435 | INCORRECT_LINE_DATA_BY_VATRATE | HU-035 | non-zero summary value at a rate (or marker) no line carries; exemptions and out-of-scope matched by node, not case; on MODIFY only with line amounts |
| 590 | INCORRECT_LINE_DATA_SELF_LINE_NUMBER | HU-035 | |
| 597 | INCORRECT_LINE_DATA_MARGIN_SCHEME_INDICATOR_NORMAL | HU-035 | same TRAVEL_AGENCY reading as 731 (the text names utilitySettlementIndicator) |
| 595 | INCORRECT_LINE_DATA_VAT_DOMESTIC_REVERSE_CHARGE_NORMAL | HU-035 | reverse-charge line with VAT (the summary-row twin was already in) |
| 631 | INCORRECT_LINE_DATA_AGGREGATE_INVOICE_LINE_DATA | HU-035 | aggregate line data on a NORMAL or SIMPLIFIED invoice |
| 5810, 5820 | ..._VAT_STATUS_VAT_DATA_MISMATCH_KBAET/KBAUK_SIMPLIFIED | HU-035 | the simplified-invoice twins of the blocking KBAET/KBAUK status checks |
| 600, 610, 630 | line amounts missing / simplified amounts on a normal line | HU-035 | 600/610 on CREATE lines of modifications only, as Annex I says; 630 sits beside the blocking LINE_SUMMARY_TYPE_MISMATCH_LINE_SIMPLIFIED (HU-006) |
| 585, 5850, 586, 5860, 587, 5870, 588, 589, 592 | INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_* | HU-035 | exemption or out-of-scope case against the kind of customer tax number; one finding per code naming the lines |
| 60, 71, 81, 91, 113, 510, 540, 1311 | register look-ups (group membership, live status, existence, domestic status) | skipped | NAV's taxpayer register |
| 342, 11400, 11401, 632, 1030 | against the stored base invoice | skipped | NAV's invoice store |
| 11, 72, 85, 112, 161, 180, 190, 210, 220, 1301, 431-433 | deprecated or inactive | left out | |

The 742, 744, 746 and 752 aggregate HUF warnings were already checked (the code builds their
names with an `AGGREGATE_` infix); 980 and 1000 are HU-006.

## Measured

NAV's 30 InvoiceData samples (`eval/hungary-nav-mutations.mjs "<clone>/sample/Data sample"`),
no day of reporting: 26 with no finding (was 27). The new finding is real: `Gyujtoszamla
2.xml`, an aggregate invoice, gives every `lineDeliveryDate` in 2019 while its header delivery
date is 2021-05-13 (warning 321); `Gyujtoszamla 1.xml`, the same invoice, has 2021 line dates,
so the 2019s look like a year that was not updated. It is now `fixtures/hungary-nav/aggregate.xml`.

With each sample's own issue date as the day of reporting (a same-day report), the four
report-date warnings add nothing; the only I.1/I.2 finding on the 30 is that 321.

NAV's API sample `manageInvoice.xml` gets warning 500 on all three operations: its seller EU VAT
number is the placeholder `AS16514193`, which does not end with the seller's taxpayerId
`48258036`.

Mutants: six new kinds, 172 mutants (county code 21, VAT code 4, the customer given the seller's
tax number, delivery 400 days after issue, a seller EU VAT number of another company, a line that
refers to itself): 172 caught by HU-034 / HU-035. Total 805 mutants, 796 caught by the expected
rule (the 9 others are the same 9 the earlier pass explains). One harness fault turned up and was
fixed: `first()` placed a seeded value with `indexOf`, so a VAT code mutation on taxpayerId
98765432 replaced the 5 inside the tax number, not the VAT code; `tail()` uses `lastIndexOf`.

Tests: `hungary-nav-annex1-head.test.mjs` (22), each seeding one fault into a NAV sample and
checking NAV's boundary (5 and 15 days, 397 days, county list edges, TRAVEL_AGENCY).

## Not done

- No real business's report with NAV's `businessValidationMessages` (unchanged).
- Warning 82's "starting with 177" is NAV's wording; Hungarian VAT group ids are commonly
  described as starting 17, so a group id 17x other than 177 in the member slot is not flagged.
- I.5 (inconsistent modification data: 1140, 1200-1230 are in; 10311, 10082 untitled in the
  PDF's text layer) was not re-read in this pass.

## Follow-up (2026-11-15, later): 313 and the harness

- **313 against NAV's change log.** Annex I lists INCORRECT_DATE_INVOICE_DELIVERY_DATE_LATE
  (397 days) with no comment, unlike the warnings it marks "Inactive" or "Deprecated". But the
  same PDF's change log, under application version 3.11, lists it as the one "Deprecated WARN
  message" next to the new blocking INVOICE_DELIVERY_DATE_LATE (delivery over issue + 5 years,
  section 3.3.2 code 54, HU-014). The check stays (a delivery 13 months out is still worth a
  look), and its message now says NAV may no longer send this warning.
- **`first()` in the mutation harness** now places the seeded value by the capture's own index
  (the regex `d` flag) instead of `indexOf`. Every current `first` mutant on NAV's 30 samples is
  byte-identical under both (md5 of each mutated file compared), so no figure above moves; the
  change stops the next mutation from landing on an earlier copy of its value.
