# VERI*FACTU: the AEAT's VAT and surcharge rate lists, 1124 and 1127 (2026-11-15, latest)

Follows eval/verifactu-offline-codes-2026-11-15.md, which left 1124 a warning because
the list it names is in the AEAT's validation document ("Validaciones y errores del
servicio", `Validaciones_Errores_Veri-Factu.pdf`), and that host refused this session
again (www.agenciatributaria.es, sede.agenciatributaria.gob.es, prewww2.aeat.es and
www2.agenciatributaria.gob.es: CONNECT 403 through the proxy, probed 2026-11-15).

## Sources: the document's rule text, quoted by two independent projects

GitHub code search for the document's file name found 170 files citing it. Two quote
section 3.1.3, rule 15 (Agrupación Desglose / DetalleDesglose), and agree:

- **mdiago/VeriFactu** (Irene Solutions; AGPL-3.0, so only the quoted AEAT text is used
  here, no code), `ValidatorRegistroAltaDetalleDesgloseTipoImpositivo.cs` and
  `...TipoRecargoEquivalencia.cs`, whose comments copy the document's wording:
  - 15.1: "Si Impuesto = "01" (IVA) o no se cumplimenta (considerándose "01" - IVA) y
    CalificacionOperacion = "S1": Solo se permiten TipoImpositivo = 0; 2; 4; 5; 7,5; 10
    y 21 (valores que indican el tanto por ciento)." 5 is admitted for FechaOperacion
    (else FechaExpedicionFactura) from 1 July 2022 to 30 September 2024; 2 and 7,5 from
    1 October to 31 December 2024.
  - 15.3: same condition; "Solo se permiten TipoRecargoEquivalencia = 0; 0,26; 0,5;
    0,62; 1; 1,4; 1,75; 5,2", then the per-rate pairs (21: 5,2 or 1,75; 10: 1,4; 7,5: 1
    in Oct-Dec 2024; 5: 0,5 to 2022, 0,62 from 2023 to Sep 2024; 4: 0,5; 2: 0,26 in
    Oct-Dec 2024; 0: 0 from 2023 to Sep 2024).
- **eloi24/verifactu-sdk** (MIT), `src/validators/taxRate.ts`, citing "Validaciones y
  errores del servicio v1.2.2" rule 15.1: the same seven rates and the same windows.

The per-rate pairs match the AEAT's own error texts 1160-1170 already in
`fixtures/verifactu/aeat-errores.properties.txt`, which VF-032 has checked since VF-032
landed, so the two quotes are consistent with the one AEAT source this session holds.

## What changed

| Code | Before | Now |
| --- | --- | --- |
| 1124 TipoImpositivo not in the list | partly: a warning for a rate outside the rates other codes name | **fully**: an error on an S1 line under Impuesto 01 or none, outside 0, 2, 4, 5, 7.5, 10, 21 (7, 8, 16, 18 up to 2012, below) |
| 1127 TipoRecargoEquivalencia not in the list | not mapped | **fully** (VF-032): outside 0, 0.26, 0.5, 0.62, 1, 1.4, 1.75, 5.2 |
| 1135 surcharge rate only up to 2012 | not mapped | **partly** (VF-032): 4% after 2012 |

VF-045 now skips lines that are not S1, as rule 15.1 does: an S2 line's rate is VF-034's
(1198, it must be 0), and N1/N2 and exempt lines carry no rate (1237, 1238).

Record coverage: 140 (120 fully, 20 in part) to **142 (122 fully, 20 in part)** of the
203 record codes, counted from `AEAT_CODE_RULES` by its `offline` field.

## Readings that are inferences, not text

- **7, 8, 16 and 18% up to 2012.** They are not in rule 15.1 as quoted (both quotes may
  be of a version that dropped them), but code 1132 says a rate is admitted only up to
  2012, and these were Spain's VAT rates before September 2012. They still pass up to
  2012 and are 1132 after. Since VF-029 rejects issue dates before 28 October 2024,
  this matters only for an old FechaOperacion.
- **1135 is taken as 4%**, the surcharge beside 16% and 18% VAT, the one old surcharge
  rate not in rule 15.3's list (1% beside the old 7% and 8% is in it, as 7.5%'s). The
  AEAT's text for 1135 does not name the rate.
- Neither quote is the PDF itself. Version: eloi24 names v1.2.2; mdiago does not say.

## Tests

- `verifactu.test.mjs`: VF-045's test now expects an error for 11% and 3%, no VF-045
  on an S2 line at 11% (VF-034 owns it), 18% in June 2012 passing; a new VF-032 test for
  the surcharge list (5.2 and 1.75 pass; 3% raises 1127 once, on the
  TipoRecargoEquivalencia path, beside the 21% pairing 1162; 4% in 2025 raises 1135;
  4% beside 18% in 2012 raises neither).
- `verifactu-response.test.mjs` unchanged; its check that every mapped code names a
  rule that exists covers 1127 and 1135.
- The AEAT's worked-example record (an artificial 11.12% rate) now carries a VF-045
  error rather than a warning; the worked-example test already expects VF-045 there.

## Not done

- The PDF itself; a rate quoted from a newer version than v1.2.2 would not be seen.
- IGIC (03) and IPSI (02) rate lists.
- No AEAT reply for 1124, 1127 or 1135 has been seen.
- 1156: eloi24 reads it as "a NIF-IVA recipient only on F1, F3, R1-R4"; that is its own
  inference (F2 and R5 carry no recipient anyway, 1190) and was not adopted.
