# Factur-X profile schemas against xmllint (2026-11-26)

What was measured: whether `cii-xsd.mjs`, with the Factur-X MINIMUM, BASIC WL and EXTENDED tables
that `build-facturx-schema.mjs` reads, gives the same valid/invalid verdict as libxml2's schema
validator on the same profile XSDs.

- Schemas: Factur-X 1.0.9 (EXTENDED's ram file 1.0.9.2), as shipped unchanged by akretion/factur-x
  at `d0c39409ec2d058ef461d1107791c5dce0f2e513`, `src/facturx/xsd_and_schematron/facturx-{minimum,basicwl,extended}/`
  (22, 43 and 85 complex types after reading). The XSDs are not in the tree; the data module holds
  facts read from them with UN/CEFACT's notice.
- Validator: `xmllint --noout --schema` (libxml2, the container's `/usr/bin/xmllint`), each file
  against the root XSD of the profile it declares in BT-24.
- Files (12): `factur-x-minimum.xml` and `factur-x-basicwl.xml` from akretion's `tests/fixtures/xml`
  (same commit); the 2 BASIC WL and 5 EXTENDED Factur-X CII examples in fnfempe/France_RFE at
  `97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d` (`FNFE_RFE_INVOICE/Z.example/TEST/FX/`); the 2
  EXTENDED test files in ZUGFeRD/mustangproject at `f9678ecef593a970b76cf0622b64825a45f17b8d`
  (`library/src/test/resources/`); and this folder's `fixtures/fr-fnfe/uc12-sous-ligne-extended-fx-cii.xml`.
  Only two of them (the F20260024 BASIC WL file and uc12) are kept in the tree, as fixtures.

## Unaltered files

| Profile | Files | xmllint valid | Pass reports nothing |
|---|---|---|---|
| MINIMUM | 1 | 1 | 1 |
| BASIC WL | 3 | 3 | 3 |
| EXTENDED | 8 | 7 | 7 |

The one invalid file, Mustang's `Extended_fremdwaehrung.xml`, fails both for the same element: a
second `URIID` in the buyer's `URIUniversalCommunication`, where the schema expects
`CompleteNumber` (xmllint) / allows one `URIID` (CII-001 here).

## Altered files

`node eval/cii-xsd-differential.mjs <dir holding facturx-minimum/, facturx-basicwl/, facturx-extended/> N <the 12 files>`,
seed 20261126: each file altered N times at random by one of: swap two adjacent sibling elements,
remove an element, duplicate one, move one into another of the ram/udt/qdt namespaces, write a
decimal with a comma, add listID to InvoiceCurrencyCode, add listVersionID to a random element.

| Run | Altered files | Same verdict | Both invalid | Both valid | Pass only invalid | xmllint only invalid |
|---|---|---|---|---|---|---|
| N=40, before the stray-attribute check | 480 | 479 | 461 | 18 | 0 | 1 |
| N=40, after | 480 | 480 | 428 | 52 | 0 | 0 |
| N=100, after | 1,199 | 1,199 | 1,054 | 145 | 0 | 0 |

The first run's one disagreement: listID on a BASIC WL `InvoiceCurrencyCode`. The EN 16931 subset
declares that attribute (fixed), so the shared checker never had to refuse an undeclared one;
BASIC WL's `CurrencyCodeType` declares none. CII-005 now covers an attribute the element's type
does not declare, read from the start tag as written (namespace declarations and `xsi:` allowed).

## The EN 16931 subset, re-run

The same script on the CEN D16B subset XSD (`eval/cii-xsd-2026-11-26.md`'s 19 files, N=30), with
the stray-attribute mutation added: first 544 of 545 (one `listVersionID` on a `udt:Indicator`,
a simple-typed element, which may carry no attribute at all), and after checking simple-typed
elements too, 545 of 545 (443 invalid, 102 valid).

`build-cii-schema.mjs`, now on the shared reader `cii-schema-read.mjs`, rebuilds
`cii-xsd-data.mjs` byte for byte from the pinned CEN commit (`cmp` against the committed file).

## EXTENDED-CTC-FR (added later on 2026-11-26)

The French reform's extension of EN 16931 (BT-24
`urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr`) ships in the same
akretion commit as a full UN/CEFACT CrossIndustryInvoice 100.D22B schema set,
`src/facturx/xsd_and_schematron/cii-extended-ctc-fr/CrossIndustryInvoice_100pD22B.xsd` (the file
akretion's own `xml_check_xsd()` uses for that level). Read by the same reader: 180 complex types,
112 simple types. Its 60-odd code-list files are imported by none of the root, ram, qdt or udt files,
so they are not read and no code list is checked (as for the other profiles).

- Files: the 5 CII EXTENDED-CTC-FR examples in fnfempe/France_RFE at
  `97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d` (`FNFE_RFE_INVOICE/Z.example/TEST/CII/EXTENDED-CTC-FR/`:
  UC10, UC11, UC12, UC13 and UC13 AUTOF). UC10 is already in the tree as
  `fixtures/fr-fnfe/uc10-multi-vendeur-extended-ctc-fr-cii.xml`.
- Unaltered: xmllint valid on all 5; the pass reports nothing on all 5.
- Altered (`node eval/cii-xsd-differential.mjs <xsd_and_schematron dir> N <files>`, seed 20261126):

| Run | Altered files | Same verdict | Both invalid | Both valid | Pass only invalid | xmllint only invalid |
|---|---|---|---|---|---|---|
| N=60 | 300 | 300 | 193 | 107 | 0 | 0 |
| N=300 | 1,499 | 1,499 | 1,013 | 486 | 0 | 0 |

- Regression check: the FNFE FX examples (Factur-X profiles, same commit) at N=40, 280 of 280 the
  same verdict; the MINIMUM, BASIC WL and EXTENDED tables in `facturx-xsd-data.mjs` are unchanged
  (each profile's JSON compared before and after the rebuild).

Two differences from the Factur-X profiles that the tests pin: BT-1's `ram:ID` under
`ExchangedDocument` is optional in D22B (the full schema, not a profile restriction; the
EXTENDED-CTC-FR Schematron requires it), and the code types declare `listVersionID`, so neither
is a schema finding here, matching xmllint.
