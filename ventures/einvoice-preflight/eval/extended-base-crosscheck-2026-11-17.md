# Extended base sets: EXTENDED-CTC-FR and Factur-X EXTENDED vs Saxon (2026-11-17)

What: an Extended-CTC-FR file (BT-24 `...#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr`)
and a Factur-X / ZUGFeRD EXTENDED file (`urn:factur-x.eu:1p0:extended`, `urn:zugferd.de:2p0:extended`)
now get their own base set on the plain route instead of the EN 16931 base:

- `plain/extended-ctc-fr-ubl.json` (953 checks) from FNFE-MPE `EXTENDED-CTC-FR-UBL.sch` V1.4.0.04
- `plain/extended-ctc-fr-cii.json` (773 checks) from `EXTENDED-CTC-FR-CII.sch` V1.4.0.04
- `plain/facturx-extended-cii.json` (1,464 checks) from `FACTUR-X_EXTENDED.sch` 1.09.2

all from github.com/fnfempe/France_RFE commit 97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d
(Apache-2.0), compiled by `build-fr-rules.mjs`. The Factur-X set looks codes up in a side file,
`document('FACTUR-X_EXTENDED_codedb.xml')`, which fontoxpath cannot open: the 210 lookups
(53 code lists, 8,491 codes) are inlined as sequences at build time. Before inlining, 30 to
40 checks per invoice were skipped.

## Before: the EN 16931 base on FNFE's 15 extended examples

Every one failed (`profile=france`, plain route, 2026-11-17 before this change). The
multi-vendor and sub-line invoices (UC10, UC11, UC12, UC13 AUTOF) each got 4 to 16 findings,
fatal among them BR-CO-10 (sum of line nets), BR-22/23 (quantity, unit on a GROUP line),
BR-26/27 (net price), BR-CO-04, BR-S-10, UBL-SR-48/52 and CII-SR-439; UC13 F202600037 got
BR-E-08 (UBL) or CII-DT-058 (CII and Factur-X). These are what the extension allows.

## After: same corpus, each file as published and broken up to eleven ways

Command:

    node eval/extended-base-crosscheck.mjs <France_RFE checkout> <sef dir>

```
files: 15; runs (file x mutation): 175; Saxon reported at least one rule on 129; distinct rule ids Saxon raised: 43; same rule ids on both engines: 175/175; plain rules skipped (engine limit): 0
  UBL original             runs   5  fired   0  agree 5/5
  UBL type-999             runs   5  fired   5  agree 5/5
  UBL currency-XXQ         runs   5  fired   5  agree 5/5
  UBL unit-ZZQ             runs   5  fired   5  agree 5/5
  UBL country-QQ           runs   5  fired   5  agree 5/5
  UBL vat-category-Q       runs   5  fired   5  agree 5/5
  UBL line-net-plus-10     runs   5  fired   5  agree 5/5
  UBL tax-total-plus-1     runs   5  fired   5  agree 5/5
  UBL no-seller-name       runs   5  fired   5  agree 5/5
  UBL issue-feb-30         runs   5  fired   0  agree 5/5
  UBL empty-note           runs   5  fired   0  agree 5/5
  CII original             runs   5  fired   0  agree 5/5
  CII type-999             runs   5  fired   5  agree 5/5
  CII currency-XXQ         runs   5  fired   5  agree 5/5
  CII unit-ZZQ             runs   5  fired   5  agree 5/5
  CII country-QQ           runs   5  fired   5  agree 5/5
  CII vat-category-Q       runs   5  fired   5  agree 5/5
  CII line-net-plus-10     runs   5  fired   5  agree 5/5
  CII tax-total-plus-1     runs   5  fired   2  agree 5/5
  CII no-seller-name       runs   5  fired   5  agree 5/5
  CII issue-feb-30         runs   5  fired   0  agree 5/5
  CII payment-means-QQ     runs   5  fired   5  agree 5/5
  CII empty-note           runs   5  fired   0  agree 5/5
  FX original              runs   5  fired   0  agree 5/5
  FX type-999              runs   5  fired   5  agree 5/5
  FX currency-XXQ          runs   5  fired   5  agree 5/5
  FX unit-ZZQ              runs   5  fired   5  agree 5/5
  FX country-QQ            runs   5  fired   5  agree 5/5
  FX vat-category-Q        runs   5  fired   5  agree 5/5
  FX line-net-plus-10      runs   5  fired   5  agree 5/5
  FX tax-total-plus-1      runs   5  fired   2  agree 5/5
  FX no-seller-name        runs   5  fired   5  agree 5/5
  FX issue-feb-30          runs   5  fired   0  agree 5/5
  FX payment-means-QQ      runs   5  fired   5  agree 5/5
  FX empty-note            runs   5  fired   5  agree 5/5
rule ids raised: BR-06 BR-CL-01 BR-CL-04 BR-CL-14 BR-CL-16 BR-CL-18 BR-CL-23 BR-CO-14 BR-FREXT-08 BR-FREXT-CO-10 BR-FREXT-CO-13 BR-FREXT-CO-15 BR-FREXT-E-01 BR-FREXT-E-08 BR-FREXT-E-08ini BR-FREXT-E-08rev BR-FREXT-S-01 BR-FREXT-S-08 BR-FREXT-S-08ini BR-FREXT-S-08rev BR-FXEXT-08 BR-FXEXT-CO-10 BR-FXEXT-CO-13 BR-FXEXT-CO-15 BR-FXEXT-E-01 BR-FXEXT-E-08 BR-FXEXT-E-08b BR-FXEXT-E-08ini BR-FXEXT-E-08rev BR-FXEXT-S-01 BR-FXEXT-S-08 BR-FXEXT-S-08ini BR-FXEXT-S-08rev BR-FXEXT-S08b FX-SCH-A-000409 FX-SCH-A-000635 FX-SCH-A-000777 FX-SCH-A-000861 FX-SCH-A-001008 FX-SCH-A-001050 FX-SCH-A-001076 FX-SCH-A-001128 PEPPOL-EN16931-R008
```

The 15 published files pass every rule of their base, and of BR-FR. The plain route and
Saxon-JS running FNFE's own compiled XSLT (`EXTENDED-CTC-FR-UBL.xslt`, `-CII.xslt`,
`FACTUR-X_EXTENDED.xslt`, exported to SEF with `npx xslt3 -nogo -relocate:on`) give the same
rule ids on 175 of 175 runs, with 0 checks unevaluated. The UBL payment-means mutation does
not apply (the published UBL files carry no `cbc:PaymentMeansCode` the regex matches), and
30 February fires on neither engine (the base sets do not check the calendar date in BT-2).

## Real files: the ZUGFeRD corpus

Command:

    node eval/extended-real-files.mjs <list> fx-ext.sef.json

ZUGFeRD/corpus commit 84f8d8f68f6c3698aa3019d701a8b82db9ba0aac: the 99 PDFs under `correct`
folders, attachments extracted with `pdfdetach -saveall`, plus the corpus's loose XML; 13
name an extended profile (intarsys ZUGFeRD 2.0, symtrax ZUGFeRD 2.1, three Mustang
`testout-ZF2Push*`).

```
symtrax__Beispiele__EXTENDED__zugferd_2p1_EXTENDED_Kostenrechnung.pdf/factur-x.xml
  EN 16931 base fatal: BR-CO-12 BR-S-08
  Factur-X EXTENDED base: PEPPOL-EN16931-R008 (fatal: -); Saxon same
intarsys__EXTENDED__zugferd_2p0_EXTENDED_InnergemeinschLieferungMehrereBestellungen.pdf/zugferd-invoice.xml
  EN 16931 base fatal: BR-CL-25
  Factur-X EXTENDED base: FX-SCH-A-000704 (fatal: FX-SCH-A-000704); Saxon same
intarsys__EXTENDED__zugferd_2p0_EXTENDED_Warenrechnung.pdf/zugferd-invoice.xml
  EN 16931 base fatal: BR-CO-12 BR-S-08
  Factur-X EXTENDED base: FX-SCH-A-001084 PEPPOL-EN16931-R008 (fatal: FX-SCH-A-001084); Saxon same
symtrax__Beispiele__EXTENDED__zugferd_2p1_EXTENDED_InnergemeinschLieferungMehrereBestellungen.pdf/factur-x.xml
  EN 16931 base fatal: BR-CL-25
  Factur-X EXTENDED base: FX-SCH-A-000704 (fatal: FX-SCH-A-000704); Saxon same
intarsys__EXTENDED__zugferd_2p0_EXTENDED_Fremdwaehrung.pdf/zugferd-invoice.xml
  EN 16931 base fatal: BR-CL-19 BR-CL-25
  Factur-X EXTENDED base: FX-SCH-A-000704 FX-SCH-A-000973 FX-SCH-A-001137 (fatal: FX-SCH-A-000704 FX-SCH-A-000973 FX-SCH-A-001137); Saxon same
intarsys__EXTENDED__zugferd_2p0_EXTENDED_Rechnungskorrektur.pdf/zugferd-invoice.xml
  EN 16931 base fatal: -
  Factur-X EXTENDED base: FX-SCH-A-001084 (fatal: FX-SCH-A-001084); Saxon same
symtrax__Beispiele__EXTENDED__zugferd_2p1_EXTENDED_Fremdwaehrung.pdf/factur-x.xml
  EN 16931 base fatal: BR-CL-19 BR-CL-25
  Factur-X EXTENDED base: FX-SCH-A-000704 FX-SCH-A-000973 FX-SCH-A-001137 (fatal: FX-SCH-A-000704 FX-SCH-A-000973 FX-SCH-A-001137); Saxon same
symtrax__Beispiele__EXTENDED__zugferd_2p1_EXTENDED_Rechnungskorrektur.pdf/factur-x.xml
  EN 16931 base fatal: -
  Factur-X EXTENDED base: - (fatal: -); Saxon same
intarsys__EXTENDED__zugferd_2p0_EXTENDED_Kostenrechnung.pdf/zugferd-invoice.xml
  EN 16931 base fatal: BR-CO-12 BR-S-08
  Factur-X EXTENDED base: PEPPOL-EN16931-R008 (fatal: -); Saxon same
symtrax__Beispiele__EXTENDED__zugferd_2p1_EXTENDED_Warenrechnung.pdf/factur-x.xml
  EN 16931 base fatal: BR-CO-12 BR-S-08
  Factur-X EXTENDED base: PEPPOL-EN16931-R008 (fatal: -); Saxon same
Mustangproject/testout-ZF2PushReverseCharge.xml
  EN 16931 base fatal: -
  Factur-X EXTENDED base: PEPPOL-EN16931-R008 (fatal: -); Saxon same
Mustangproject/testout-ZF2PushItemChargesAllowances.xml
  EN 16931 base fatal: -
  Factur-X EXTENDED base: PEPPOL-EN16931-R008 (fatal: -); Saxon same
Mustangproject/testout-ZF2PushRelativeChargesAllowances.xml
  EN 16931 base fatal: -
  Factur-X EXTENDED base: PEPPOL-EN16931-R008 (fatal: -); Saxon same
files: 13; with a fatal finding under the EN 16931 base: 8; under the Factur-X EXTENDED base: 6; plain = Saxon on 13/13; plain rules skipped: 0
```

- The EN 16931 base raised fatal BR-CO-12 and BR-S-08 on four of them (Kostenrechnung and
  Warenrechnung, both vendors): the Factur-X EXTENDED base, and Saxon, accept those.
- What the extended base still raises is code-list drift between ZUGFeRD 2.0/2.1 and
  Factur-X 1.09.2, which the EN 16931 base also caught under its own ids: the buyer's
  electronic address scheme 9958 (FX-SCH-A-000704; the Leitweg-ID scheme is now 0204; BR-CL-25
  in the EU base), allowance reason codes (FX-SCH-A-000973/001137; BR-CL-19) and a package
  unit code (FX-SCH-A-001084). These samples are dated 2019-2021: a reader fixing one today
  needs the current code.
- PEPPOL-EN16931-R008 (an empty element) is a warning.

Plain = Saxon on 13 of 13.

## Limits

- No real Extended-CTC-FR file from a French platform (PA) was run; FNFE's examples are
  made up. No real platform's rejection compared.
- The Factur-X set's own messages are bare ("Value of '@schemeID' is not allowed"); the
  finding's path says where and `schematron-fixes.mjs` adds a generic fix for FX-SCH-A-*. A
  per-list message naming the code list is not done.
- The _WARNING copies were not run. The Factur-X EN 16931 and BASIC WL sets (`FACTUR-X_EN16931.sch`,
  `FACTUR-X_BASIC-WL.sch`) are not built: an EN 16931 Factur-X file keeps the EN 16931 base,
  which is what those profiles promise.
