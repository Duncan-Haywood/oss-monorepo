# VERI*FACTU: the AEAT's validation document read for IGIC and IPSI (2026-11-16, latest)

Follows eval/verifactu-rate-lists-2026-11-15.md, which left "IGIC (03) and IPSI (02)
rate lists" and 1156 open because the AEAT's validation document ("Validaciones y
errores del servicio", `Validaciones_Errores_Veri-Factu.pdf`) was unreachable
(agenciatributaria hosts still refuse the proxy).

## Source

- **The document's own text, version 1.1.5 (2 October 2025)**, as a plain-text
  extraction of the PDF kept in NigelBecholtz/verifactu-docs
  (`pdf-info/Validaciones_Errores_Veri-Factu.txt`, 1,062 lines, SHA-256 prefix
  0dc42b52092a9921; found by GitHub code search). Only the AEAT's rule text is used.
  It is older than the v1.2.2 that eloi24 cites; its rule 15.1 and 15.3 text matches
  both earlier quotes word for word, so the rate lists already shipped are confirmed by
  the document itself.
- **The later schema** `SuministroInformacion.xsd` (git blob
  4f1dff055944561b500db64d4a31921ae15a31d4, SHA-256 prefix ee4c1655175644de), byte-identical
  in eloi24/verifactu-sdk (MIT), Virako/ynvo, ramoncoroso/verifactu, manuel-umu/lacre and
  three more. Against the copy `verifactu-lists.mjs` was built from (blob a39cbd0…) it
  adds a `SistemaInformaticoConsultaType`, ClaveRegimen **21**, and CountryType2 **RE**.
  OperacionExentaType already listed E1 to E8 in both.

## What the document says

1. **No IGIC or IPSI rate list exists.** Rule 15.1 lists TipoImpositivo values only "Si
   Impuesto = 01 (IVA) o no se cumplimenta"; rule 15.3 the same for the surcharge. So
   the AEAT does not reject an IGIC (7%, 15% ...) or IPSI rate by value, and the checker
   was right to skip them (VF-045 and VF-032 stay VAT-only). The open item closes as
   "nothing to check", not as a missing table.
2. **Rule 15.5:** under IVA, OperacionExenta is in list L10; under IGIC it is "L10 y
   adicionalmente podrá contener los valores E7 y E8".
3. **Rule 15.6:** under IVA, ClaveRegimen is in L8A; under IGIC in L8B, plus 20 and 21
   (15.6.10, 15.6.11; 21, simplified regime, added in v1.1.2 of 15 July 2025).
4. **Rule 15.6.8:** "Si Impuesto = 01 (IVA) o no se cumplimenta ... ClaveRegimen 11,
   únicamente se admitirá el TipoImpositivo = 21". The AEAT's code text for 1206 does not
   name the tax; the document limits it to VAT.
5. **Rule 13, last bullet (1156):** a recipient identified by IDOtro with IDType 02
   (NIF-IVA) only on TipoFactura F1, F3, R1, R2, R3 or R4.

## Faults this found in the checker (false errors on valid Canary Islands records)

| Record | Before | Now |
| --- | --- | --- |
| IGIC line, OperacionExenta E7 or E8 | VF-027 error, "unknown qualification" | clean |
| IGIC line, ClaveRegimen 21 | VF-043 error, 1246 "not in the list" | clean |
| IGIC line, ClaveRegimen 11 at 7% | VF-038 error, 1206 "must be 21%" | clean |
| VAT line, E7 or E8 | VF-027 "unknown" | VF-038, 1182 (an IGIC-only value) |
| VAT line, ClaveRegimen 21 | VF-043, 1246 | VF-038, 1246 (an IGIC-only key) |
| F2 or R5 naming a NIF-IVA buyer | 1190 only | also 1156 (VF-039) |
| Buyer with CodigoPais RE | VF-043, 1101 | clean (in the later schema) |

E7, E8 and 21 on IPSI (02) or other (05) lines are left alone: the document states the
lists for IVA and IGIC only.

Record coverage: 142 (122 fully, 20 in part) to **143 (123 fully, 20 in part)** of the
203 record codes (1156 added), counted from `AEAT_CODE_RULES` by its `offline` field.

## Tests

`verifactu.test.mjs`, new test "IGIC lines: E7/E8 (1182), regime 21 (1246), regime 11 at
7% (1206); 1156 NIF-IVA buyer": 13 assertions. It fails on the code before this change
(checked with the three source files stashed) and passes after.
`python3 platform/ci/run_venture_tests.py einvoice-preflight`: ok, 2,565 tests.

## Not done

- Lists L8A, L8B and L10 themselves are in the AEAT's record design document, not this
  one; the values above come from the schema's enumerations.
- No AEAT reply for an IGIC record has been seen; a production SIF's records stay open.
- v1.2.x of the document itself (only v1.1.5 was found as text).
