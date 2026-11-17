# Mustang's validator on the Factur-X writer (2026-11-14)

Mustang 2.26.0 (`org.mustangproject:Mustang-CLI:2.26.0`, Apache-2.0), the fat jar
from Maven Central (59,163,641 bytes; an earlier session got an empty response for
`org/mustangproject/`, this one did not: the first GET 404'd, the second returned
the jar). Mustang runs veraPDF on the PDF part and the ZUGFeRD/Factur-X 2.5
Schematron (and KoSIT's XRechnung 3.0 Schematron when the guideline id names it)
on the embedded XML.

Reproduce:

```
node eval/facturx-pdf-verapdf.mjs <dir>          # writes the PDFs
node eval/facturx-pdf-mustang.mjs Mustang-CLI-2.26.0.jar <dir>/*.pdf
```

## Before: 8 of 8 valid, every file with one failed rule

| case | PDF/A | XML | failed rule |
|---|---|---|---|
| plain-en16931, credit-note, eighty-lines, polish-greek-cyrillic, outside-font, exempt-and-reverse, prepaid-long-note | 3b valid | valid (EN 16931) | PEPPOL-EN16931-R008 (warning) |
| plain-xrechnung | 3b valid | valid (XRechnung 3.0) | BR-DE-TMP-32 (notice) |

Both point at the same gap. The writer always emitted
`<ram:ApplicableHeaderTradeDelivery/>` (the element is mandatory in the CII
schema) and had no way to fill it: the draft format had no delivery date.
PEPPOL-EN16931-R008 ("Document MUST not contain empty elements") fires on the
empty element; BR-DE-TMP-32 asks an XRechnung for a delivery date (BT-72), an
invoicing period (BG-14) or a period on every line. German VAT law asks for the
same date on the invoice (§14 (4) no. 6 UStG; EU VAT Directive art. 226 (7) when
it differs from the issue date).

## The change

- `generate.mjs`: a `delivery_date` draft field (YYYY-MM-DD, refused if not a
  real date). UBL writes `cac:Delivery/cbc:ActualDeliveryDate` after
  `AccountingCustomerParty`; CII writes
  `ApplicableHeaderTradeDelivery/ActualDeliverySupplyChainEvent/OccurrenceDateTime`.
  With neither a delivery date nor a period, the XRechnung profile now warns
  (BR-DE-TMP-32) before the file is made. Without one the CII element stays
  empty, since the schema requires it.
- `facturx-pdf.mjs`: the printed page shows "Delivery date".
- `create.html`: delivery/service date and service period fields (the period was
  supported by the writer but had no field on the page).
- `examples/draft-invoice.json` gains a delivery date.

## After: 10 of 10 valid, 9 with no failed rule

| case | PDF/A | XML rules fired | failed |
|---|---|---|---|
| credit-note | 3b valid | 104 | 0 |
| eighty-lines (4 pages) | 3b valid | 1,429 | 0 |
| exempt-and-reverse | 3b valid | 106 | 0 |
| no-delivery-date (control) | 3b valid | 102 | 1: PEPPOL-EN16931-R008 |
| outside-font | 3b valid | 104 | 0 |
| plain-en16931 | 3b valid | 103 | 0 |
| plain-xrechnung | 3b valid | 20 | 0 |
| polish-greek-cyrillic | 3b valid | 104 | 0 |
| prepaid-long-note | 3b valid | 105 | 0 |
| service-period-xrechnung (period, no delivery date) | 3b valid | 20 | 0 |

The control keeps the warning, as intended: a draft with no delivery facts has
nothing to put in the mandatory element.

Not checked here: Mustang on the plain UBL and CII XML files (this session's
sandbox refused that run), Acrobat preflight, a real receiver's portal.
