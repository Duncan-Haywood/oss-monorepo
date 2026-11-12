# Carta Porte 3.1 on public files (2026-11-12)

What `eval/cartaporte-public-files.mjs` printed on the CFDI 4.0 files with a Carta Porte 3.1
complement that a GitHub code search finds. The files are third-party and some are real
waybills, so none is copied into this tree; this note says how to fetch them again.

## Getting the files

1. `GET https://api.github.com/search/code?q=CartaPorte31+extension:xml&per_page=100&page=N`
   for N = 1..7 (618 results reported, 699 distinct URLs over the pages on 2026-11-12).
2. Turn each `html_url` into its raw.githubusercontent.com address and download it.
3. `node eval/cartaporte-public-files.mjs <xsd dir> <downloaded files>`, with the XSD
   directory laid out as for `eval/cartaporte-xsd-diff.mjs` (phpcfdi/resources-sat-xml).

## Result

```
698 files read, 322 distinct CFDI 4.0 files with the complement, 8 not CFDIs (MX-001)
schema verdict agrees with xmllint on 314 of 314; xmllint-valid: 21
stamps: real PAC 5, test or placeholder 290, none 19
  MX-070: PAC 0 (), test 0, none 1
  MX-071: PAC 1 (1 file), test 35, none 4
  MX-073: PAC 0 (), test 252, none 0
  MX-074: PAC 0 (), test 0, none 4
  MX-075: PAC 0 (), test 255, none 2
  MX-076: PAC 0 (), test 0, none 2
  MX-079: PAC 1 (1 file), test 255, none 4
  PAC-stamped file: no finding
  PAC-stamped file: MX-071
  PAC-stamped file: no finding
  PAC-stamped file: MX-007,MX-079,MX-079,MX-079
  PAC-stamped file: no finding
```

Where the 322 come from (distinct files by repository): one project's generated demo and
stress files with SAT's test certificate, 257 (desibarra/sentinel-dashboard); Odoo QWeb
templates and copies of them with `___ignore___` placeholders, 39 across 7 repositories;
PAC SDK samples (lunasoft), 14; and a handful of single files. Only 21 are valid against
CartaPorte31.xsd.

The five with a real PAC's stamp (RfcProvCertif not SAT's test certificate):

| file | stamp | findings | reading |
|---|---|---|---|
| 3rrecyling-crypto/3R `xmls/2026/01/A-2728.xml` | 2025-02 | none | a real waybill |
| 3rrecyling-crypto/3R `xmls/2026/01/A-3011.xml` | | none | a real waybill |
| JoanMedina16/ReprocesadorPolizasGM `LOGISERVICES/bin/Debug/cfdi.xml` | 2026-02-15 | MX-007, MX-079 x3 | four RFCs the PAC accepted fail the mod-11 digit: registered RFCs can fail it (the known MX-007 caveat) |
| appsmexico/AppsMexico.Integraciones `test/FE/4.0/20240724_T_EKU9003173C9_TR1.xml` | 2024-07-24 | MX-071 | CantidadTransporta sends goods to DE202021, which is not a location; the test PAC stamped it anyway |
| lunasoft/sw-sdk-ruby `Test/Resources/cfdi/cp31.xml` | | none | UnidadPeso XBX, so PesoBrutoTotal is not compared (skipped) |

Two consequences for the checker. A stamp does not prove the complement's cross-references
hold (the DE202021 file), so `MX-071` stays. And the run found a bug shared by every CFDI
complement: the schema layer counted written zeros against `fractionDigits`, so a real
stamped `PesoBrutoVehicular="27.8900"` (2 decimals allowed) drew `MX-003`; xmllint
accepts it, and so did the PAC. `cfdi.mjs` now drops trailing zeros first.

The demo files' `MX-073` (PesoBrutoTotal unequal to the goods' PesoEnKg) and `MX-075`
(T3S2 without Remolques) are real defects in generated data, not evidence about SAT.
