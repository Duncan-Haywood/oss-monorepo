# VERI*FACTU: the offline-checkable AEAT codes, VF-043 to VF-047 (2026-11-15, later)

Update: 1124 is now mapped fully from the validation document's rule 15.1 as quoted publicly,
and 1127/1135 added: eval/verifactu-rate-lists-2026-11-15.md.

Follows eval/verifactu-aeat-codes-2026-11-15.md, whose "next rules to write" list this
slice works through.

## Sources

- The AEAT's error list, `fixtures/verifactu/aeat-errores.properties.txt` (unchanged,
  SHA-256 06519ceb…5902): the Spanish text of each code is the rule.
- The schema's code lists, `SuministroInformacion.xsd` (tikeV1.0). The AEAT's copy on
  prewww2.aeat.es refused this session's proxy (CONNECT 403; it answered the run
  before). Read instead from three copies on raw.githubusercontent.com, all
  byte-identical, SHA-256 `ebba5565257c499646041d6250b28dc99226e25653403afa62dc6e4a0dd538ea`:
  Eseperio/verifactu-php `src/schemes/` (MIT), emiliopm/verifactu `xsd/` on main and on
  master. invoiceninja's copy differs (a local xmldsig import and a reworked period
  type) and was not used. Kept in `verifactu-lists.mjs`: CountryType2 (245 codes),
  ImpuestoType (01 02 03 05), IdOperacionesTrascendenciaTributariaType (17 keys: 01-11,
  14, 15, 17-20), PersonaFisicaJuridicaIDTypeType (02-07), GeneradoPorType (E D T).

## Rules and the codes they cover

| Rule | AEAT codes | Mapped |
| --- | --- | --- |
| VF-043 code lists, S/N flags | 1101, 1111, 1212, 1213, 1218, 1226, 1231, 1246 | fully |
| VF-044 dates | 1133, 1134 fully; 1146, 1173 in part | see below |
| VF-045 VAT rate by date | 1132 fully; 1124, 1194, 1235, 1236 in part | see below |
| VF-046 GB/XI prefixes | 1254, 1255 | fully |
| VF-047 Generador | 1224, 1225, 1227-1230 fully; 1258, 1259 in part (census) | |

27 codes; record coverage moves from 113 (101 fully, 12 in part) to 140 (120 fully,
20 in part) of 203. Counted from `AEAT_CODE_RULES` against the 203 record codes.

## Readings that are inferences, not text

- **1194, 1235, 1236 do not name the rate.** Their text says "the value given is only
  allowed between ...". The rule takes 1194 as 5% (its window, 1 July 2022 to 30
  September 2024, is exactly the union of the 5% surcharge codes 1167 and 1168) and
  1235/1236 as 2% and 7.5% (their window, October-December 2024, is that of 1166 and
  1169). Which of 1235/1236 is which is not known; the finding names both.
- **1124's list** is in the AEAT's validation PDF, which still fails TLS through the
  proxy. The rule's set is the rates the error list itself names (0, 2, 4, 5, 7.5, 10,
  21; 7, 8, 16, 18 to 2012), and a rate outside it is a warning, not an error.
- **1146 and 1173** say an operation after the issue date (or in the future) is allowed
  only "if the breakdown lines are ClaveRegimen 14 or 15 and Impuesto 01, 03 or empty".
  The rule lets the record pass when any line qualifies; the stricter reading (every
  line) is untested against the AEAT. 1173 uses this tool's clock, so it is a check
  against "today" as the user's machine sees it.
- IGIC (03) and IPSI (02) rates are not checked by VF-045.

## Tests

- `verifactu.test.mjs`, five new tests: each code fires on a record built to break it
  and stays quiet on its clean twin (UK and EL rejected as country codes, GB as a VAT
  number after Brexit, 5% in April 2025, 2% in April 2025 but not in November 2024 nor
  on a January 2025 invoice for a December 2024 operation, each Generador code alone).
  The clock is fixed (`now: 2026-11-15`) except in one test that checks the default.
- `verifactu-response.test.mjs`: unchanged; its check that every mapped code names a
  rule verifactu.mjs raises covers the 27 new entries.
- Side effect: the AEAT's worked-example record (rate 11.12%, an artificial value)
  now also carries a VF-045 warning; the test names it.
- Full venture suite: `python3 platform/ci/run_venture_tests.py einvoice-preflight`
  passes (see the run record for the count).

## Not done

- 1156 (which TipoFactura a NIF-IVA buyer allows): the text does not say which.
- No AEAT reply for any of these 27 codes has been seen; the mapping is the AEAT's
  text read against the rules.
