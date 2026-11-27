# CII header allowances and charges in the repair (2026-11-14)

Before this run `repair-cii.mjs` declined every CII document with a header
allowance or charge (BG-20/BG-21). Of the 358 seeded Factur-X PDFs in
`repair-real-files-2026-11-14.md`, 66 were declined for that reason alone. The
repair also stopped at a second `TaxTotalAmount` (BT-111, the VAT accounting
currency's), which most of the allowance files turned out to have.

## What changed

- Header `SpecifiedTradeAllowanceCharge` (indicator, `ActualAmount`,
  `CategoryTradeTax` category and rate) moves its own tax group's basis (BT-116 =
  line nets - allowances + charges in the group). EXTENDED's
  `SpecifiedLogisticsServiceCharge` counts as a charge, which is how `cii.mjs`
  already reads it for the checks. A group made only of an allowance or charge
  needs its own header tax block. A group that nets to 0 needs none.
- The summation's `AllowanceTotalAmount`, `ChargeTotalAmount` and
  `TaxBasisTotalAmount` (lines - allowances + charges) are recomputed. If one of
  them is missing but should be non-zero, the repair says so; it does not add
  elements.
- E, Z and O with no rate count as 0%, for lines, allowances and header blocks
  alike.
- BT-110 is the `TaxTotalAmount` whose `currencyID` is the invoice currency. A
  second one in another currency (BT-111) is left as written and said so. If
  both are in the invoice currency, the second repeats the first, as in the UBL
  repair. If either has no currency, the tax is not recomputed.
- An allowance with no readable indicator, amount or category stops the tax
  part, and the repair says why.

## Unseeded and seeded, XML and PDF (`node eval/cii-header-allowances.mjs`)

Checkouts: ZUGFeRD/corpus 84f8d8f, ZUGFeRD/mustangproject 42127fa,
itplr-kosit/xrechnung-testsuite 1ce1daf, ConnectingEurope/eInvoicing-EN16931
b17b269. Files were read from the checkouts, not copied here. Fail and invalid
folders were skipped. The test set is every CII invoice, as XML or embedded in a
PDF, with a header allowance or charge: 77 files, 66 distinct documents.

| | count |
|---|---|
| distinct documents | 66 |
| recomputed, came back unchanged | **64** |
| recomputed, changed | **0** |
| declined (a line with no quantity; XRechnung-O, category O with no TaxTotalAmount) | 2 |
| seeded faults (one of 7 totals +7.00 per document) | 459 |
| restored to the original totals and breakdown, compared as numbers | **449** |
| declined with the reason printed | 10 |
| wrong | **0** |

The comparison is numeric: totals and tax breakdown are read back with
`parseCiiInvoice`, because a file that writes `10` gets `10.00` back.

## The broad run (`node eval/repair-real-files.mjs`)

529 files, unchanged from this morning: 2 changed (both invalid as written), 0
amounts due moved.

## The PDF run (`python3 eval/repair-seeded-facturx.py`, pikepdf 10.18.1, qpdf 12.4.2)

| | before (this morning) | after |
|---|---|---|
| seeded PDFs | 358 | 358 |
| qpdf passes the repaired PDF | 358 | **358** |
| page count kept | 358 | 358 |
| attachment read back by qpdf equals the original XML byte for byte | 248 | **314** |
| declined | 110 | **44** (32 lines with no quantity or price, 12 sub-invoice lines) |

## Limits

These are test-suite files, not a business's own exports. veraPDF has still not
been run. Allowance amounts are taken as written: `CalculationPercent x
BasisAmount` is not checked against `ActualAmount`, because EN 16931 has no rule
that ties them together.
