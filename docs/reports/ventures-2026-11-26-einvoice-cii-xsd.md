---
kind: milestone
date: 2026-11-26
---
# einvoice: CII D16B schema validation with namespaces (2026-11-26)

Bet #3 (e-invoice fix-and-explain), `private-monorepo` einvoice-preflight ROADMAP Next 4 (CII part),
merged as private PR #237 (squash `e2352d56`). Claim `claim/einvoice-preflight/cii-xsd-schema`.

## What landed

- `cii-xsd.mjs` checks every CII file whose BT-24 is `urn:cen.eu:en16931:2017` or starts with `...#compliant#`
  against CEN's "D16B SCRDM (Subset)" uncoupled XSD (`build-cii-schema.mjs`, ConnectingEurope/eInvoicing-EN16931
  at `b17b2695`). Rules CII-001..007; CII-007 is namespaces, resolved from the file's own xmlns declarations
  (parseXmlTree drops prefixes, so `annotateNamespaces` re-reads the start tags in the same order).
- `xsd-check.mjs` gained an opt-in namespace check (`codes.ns` + particle `ns`); FA(3)/NAV are unaffected.
- Runs in `report.mjs` on every route, so the paid `pro/check.mjs` gets it. DE/FR/EN templates are in `pro/explain-catalog.mjs`.
- Site lists (en/de/fr): CII schema is now under "checked"; UBL 2.1 and EXTENDED/MINIMUM/BASIC WL stay under "not checked".

## Measured

499 of 499 random mutants of the 12 CEN EN 16931 CII examples and the app's 7 CII files get the same
valid/invalid verdict as xmllint (`apps/einvoice-preflight/eval/cii-xsd-2026-11-26.md`). Three app examples were
really invalid: `cii-invoice.xml` (PaymentReference/currency order, Charge before Allowance) and both CII credit
notes (`udt:DateTimeString` in BT-26). They are fixed, and the 3 example PDFs were rebuilt with `build_pdf_with_attachment(flate=True)`,
which reproduces the old PDFs byte for byte from the old XML.

## For the next run

- UBL 2.1 XSD: docs.oasis-open.org is refused by the proxy (403), and the ConnectingEurope repo has no UBL XSD.
  The builder will need `ref=` to global elements and `xsd:any` (UBLExtensions/ExtensionContent).
- The Factur-X EXTENDED/MINIMUM/BASIC WL schemas would let those profiles be checked too. Today they are skipped
  on purpose, because the subset would refuse EXTENDED's extra elements.
- The Python port (`src/einvoice_preflight`) has no schema pass. The JS report is what the service runs.
- private-monorepo CI was starved on #237 (`ci_starvation.py`: no runner). Verified locally: root 2191 pass with the
  1 environmental pdfdetach failure, pro 113/113, site build and 30/30, Python examples/facturx 23/23.
  `biome ci apps/einvoice-site` was not run, because biome is not installed here. The change there is string content only.
