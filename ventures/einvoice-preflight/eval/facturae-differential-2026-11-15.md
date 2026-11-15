# Facturae reader vs xmllint and the Ministry's XSDs (2026-11-15)

`facturae.mjs` reads Spain's Facturae 3.2.1 and 3.2.2. This file records how it
was checked. Command (the XSDs are not in the tree; download them from
facturae.gob.es, `/content/dam/facturae/formato/versiones/Facturaev3_2_1.xml` and
`Facturaev3_2_2.xml`, and the W3C `xmldsig-core-schema.xsd`):

```
node eval/facturae-differential.mjs Facturaev3_2_1.xml Facturaev3_2_2.xml xmldsig-core-schema.xsd 500 20261115
node eval/facturae-differential.mjs Facturaev3_2_1.xml Facturaev3_2_2.xml xmldsig-core-schema.xsd 500 7
```

Sources read: the two XSDs (SHA-256 pinned in `build-facturae-schema.mjs`) and
the Ministry's field description, "Esquema castellano v3.2.x", dated 06/06/2017,
from the same site. Every ES arithmetic rule restates a formula from that
description (field numbers 1.5.2-1.5.5, 3.1.5.1-3.1.5.17, 3.1.6.1.17, 3.1.6.1.20).

## Results, two seeds, 1,000 generated files

| Check | Result |
|---|---|
| Generated files valid under xmllint + official XSD | 1,000 / 1,000 |
| Of those, files this checker flagged (false rejects) | **0** |
| Structural mutants (18 kinds) | 6,539, of which xmllint rejects 6,072 |
| Mutants where our schema verdict equals xmllint's | **6,539 / 6,539** |
| Arithmetic and consistency mutants (14 kinds) | 5,006 |
| Of those, caught by the expected ES rule | **5,006 / 5,006** |

The generator draws batches of 1 to 4 invoices with 1 to 5 lines, line discounts
and charges, IVA (21/10/4) or IGIC (7/3/0), recargo de equivalencia, 15% or 7%
IRPF withheld, general discounts, advances, subsidies, suplidos, retention amounts,
rectificativas (3.2.2 with the corrected invoice's date), foreign buyers with
overseas addresses, USD invoices with ExchangeRateDetails and euro equivalents,
and valid DNI, NIE and CIF numbers.

Structural mutants: drop a required element (TaxCurrencyCode, ItemDescription,
BatchIdentifier), drop an optional one (InvoiceSeriesCode: both accept, as they
should), swap Quantity and UnitPriceWithoutTax, add an unknown element, duplicate
IssueDate, a bad InvoiceClass, TaxTypeCode or CountryCode, a decimal comma, nine
decimals, an exponent, a 22-character InvoiceNumber, 30 February, a 4-digit
postcode, a cut-off file, and both address forms at once.

Arithmetic mutants (XSD-valid unless noted): TotalCost +1.00, GrossAmount +0.50,
TotalGrossAmount +0.05, one cuota +0.02, TotalTaxOutputs +1.00, TotalTaxesWithheld
+3.00, InvoiceTotal +0.10, TotalOutstandingAmount -5.00, TotalExecutableAmount
+2.00, Batch TotalInvoicesAmount +1.00, InvoicesCount +1, OO changed to OR with no
Corrective, one digit changed in the seller's NIF, and SchemaVersion changed to
the other version (the XSD's enumeration rejects that too, so it is not XSD-valid;
ES-001 still names the mismatch).

## What this does not show

- **The generator and the checker were written by the same session from the same
  reading of the field description.** The structure verdicts are independent
  (xmllint and the Ministry's XSD decide them); the arithmetic rules are not, so a
  shared misreading of a formula would pass here. No real business's Facturae
  file, and no FACe rejection, was available to compare with.
- Not checked: the XAdES signature, FACe's DIR3 directory of administrative
  centres, FACe's own validation codes, Facturae 3.2 (2009) files (the schema
  step is skipped and named), and the Extensions block (accepted unread).
- ES-026 (invoice tax bases against the lines' bases per rate) is skipped when a
  general discount or charge is present, because how those spread over rates is
  not modelled.

## Found on the way

**Valid Spanish NIEs and K/L/M NIFs were rejected (INV-023), in JS and Python.**
`vat.mjs` and `vat.py` sent X/Y/Z and K/L/M numbers to the CIF check. A
differential against python-stdnum 2.2 `es.nif` on 6,000 seeded numbers (1,339
valid) gave 891 disagreements before the fix, 750 of them valid NIE or K/L/M
numbers we refused. After: 55, all CIFs where stdnum accepts either a letter or a
digit as the control and we require the form the first letter calls for (letter for N, P, Q, R, S and W,
digit for A, B, E and H, either for the rest). That stricter rule was kept on
purpose; it is noted here because a real CIF issued the other way would be flagged.
JS and Python now give the same verdict on all 6,000.
