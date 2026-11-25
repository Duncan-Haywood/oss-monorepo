# Page vs Python CLI: rule ids on every shipped invoice file (2026-11-25)

Command: `node eval/page-cli-parity.mjs` (Node 22, Python 3.11, from this
directory; no network). The page side is `preflightDocuments` from
`page-engine.mjs` with default options, one file at a time; the CLI side is
`python3 -m einvoice_preflight <file> --format json`. JSON files that are not
invoices (test tables) are skipped.

## Before the fix

```
files: 104
  same: 38
  rules differ: 4
  page only reads: 61
  CLI only reads: 0
  neither reads: 1
files where the rules differ:
  examples/factur-x-credit-note-with-defects.pdf: page only [PDF-001]
  examples/factur-x-credit-note.pdf: page only [PDF-001]
  examples/factur-x-invoice.pdf: page only [PDF-001]
  examples/nlcius-cii-invoice-with-defects.xml: page only [INV-046]
```

INV-046 (cash means with an IBAN) was missing because `formats.py` mapped the
CII `SpecifiedTradeSettlementPaymentMeans/TypeCode` to `payment["means_code"]`
while `means.py` reads `payment["means"]` (the UBL reader already used
`means`). So the CLI never ran INV-044, INV-045 or INV-046 on any CII file.

## After

```
files: 104
  same: 39
  rules differ: 3
  page only reads: 61
  CLI only reads: 0
  neither reads: 1

rule ids reported by one side only, on files both read (files):
  page only PDF-001: 3

files only the page reads, by folder:
  examples: 8
  fixtures: 29
  fixtures/facturae: 1
  fixtures/flux10: 3
  fixtures/fr-fnfe/cdar: 5
  fixtures/hungary-nav: 11
  fixtures/verifactu: 4

files where the rules differ:
  examples/factur-x-credit-note-with-defects.pdf: page only [PDF-001] CLI only []
  examples/factur-x-credit-note.pdf: page only [PDF-001] CLI only []
  examples/factur-x-invoice.pdf: page only [PDF-001] CLI only []
```

The one file neither reads (`fixtures/fr-fnfe/uc10-multi-vendeur-extended-ctc-fr-ubl.xml`)
fails the same way on both sides ("UBL field InvoicedQuantity is missing").

The 61 page-only files by root element: 14 cfdi:Comprobante; 11 NAV
(10 InvoiceData, 1 ManageInvoiceRequest); 9 NFS-e (ABRASF lots and queries,
CompNfse, DPS, NFSe); 6 Faktura (FA(3)); 5 CDAR responses; 4 NF-e events
(3 envEvento, 1 procEventoNFe); 3 Flux 10 reports; 2 FatturaElettronica;
2 NFe; 2 VERI*FACTU records; 2 SOAP envelopes; 1 Facturae.

## What this does not measure

Messages and fix texts (only rule ids are compared); warnings and notes the CLI
has no severity for; Norway and Switzerland VAT and profile options (no shipped
file exercises them on both sides); generated or real business files.
