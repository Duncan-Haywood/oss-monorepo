# VERI*FACTU: the AEAT's error list, mapped to the checker (2026-11-15, later)

## Source

`fixtures/verifactu/aeat-errores.properties.txt`, fetched from
`https://prewww2.aeat.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/errores.properties`
on 2026-11-15 (HTTP 200, Last-Modified Thu, 30 Jul 2026 11:45:16 GMT). SHA-256
`06519ceb23422bd6b0ad3bfb659e3007615050da4920781d12cff536481d5902`, the same value
Iescudero157/cuentas-eu recorded for its copy on 2026-09-20, so the list has not
changed since at least then. The earlier run (eval/verifactu-records-2026-11-15.md)
found this host refusing the proxy; it answered this time. The AEAT's validation PDF on
www.agenciatributaria.es still fails here (its certificate uses a digest the proxy's TLS
rejects), so the rules below are read from the code list's own text.

| Section | Codes |
| --- | ---: |
| Whole submission rejected (4xxx, 3500-3503) | 44 |
| Record rejected (1xxx, 3000-3004) | 193 |
| Record accepted, to be corrected (2xxx) | 10 |
| Total | 247 |

## Library copies are stale

| Copy | Codes | Has 1278-1280 (gone from the AEAT list) | Has 1285-1293, 2009, 4141 (new) |
| --- | ---: | --- | --- |
| Eseperio/verifactu-php `ErrorRegistry.php` (MIT) | 239 | yes | no |
| lmcirac/customer_documentation list (2025-07-31) | 234 | yes | no |
| Iescudero157/cuentas-eu (kept intact, with hash) | 247 | no | yes |

Of the 236 codes Eseperio's copy shares with the AEAT file, 208 carry the same text and
28 differ in wording (e.g. 1111 now says "NIF-IVA (02)", 1198 spells out S2). The
earlier record rules followed josemmo/Verifactu-PHP; VF-028 (surcharge only under
ClaveRegimen 18) matches 1279/1280, which the current list no longer carries; it stays
as a rule, unmapped to a current code.

## Coverage (`AEAT_CODE_RULES` in verifactu-response.mjs)

| Scope | Mapped fully | Mapped in part | No file-only check (reason given) | Unmapped |
| --- | ---: | ---: | ---: | ---: |
| About a record (203) | 101 | 12 | 10 | 80 |
| Whole submission (44) | 0 | 0 | 6 | 38 |

"In part": the rule checks a shape or one half of the AEAT's condition (a NIF's shape and
check letter where the AEAT also checks the census; the issue date against the
generation time where the AEAT uses its own clock). Unmapped codes still get the AEAT's
Spanish text and a reason class (census, technical, header, query, schema) from that text.

Unmapped but checkable offline, the next rules to write: 1101/1111 (CodigoPais),
1124/1132/1194/1235/1236 (the VAT rate list by date), 1133/1134 (dates over 20 years
old), 1146/1173 (operation date after issue date), 1156, 1218 (Impuesto), 1246
(ClaveRegimen list), 1254/1255 (XI and GB prefixes by date), 1224-1231 (Generador).

## Tests

- `verifactu-response.test.mjs`: the data file is the fixture byte for byte (hash,
  247 codes, 44/193/10 by section); every mapped code is in the AEAT list and names a
  rule verifactu.mjs raises; the real reply below; accepted-with-errors is a warning;
  census and duplicate codes say why they are not checked; digit runs of 8+ withheld;
  a SOAP fault (4102) refuses the whole submission; a correct line whose record the
  checker flags is reported (AEAT-PASSED).
- `verifactu.test.mjs`: VF-029 to VF-042 each fire on a record built to break the AEAT
  text they come from, and stay quiet on the clean record and its F2 form.
- Full venture suite: 2,558 tests pass (`python3 platform/ci/run_venture_tests.py einvoice-preflight`).

## The one real AEAT reply

`fixtures/verifactu/curried-response-1123.xml` (curriedsoftware/verifactu, MIT, recorded
from the AEAT and anonymised): EstadoEnvio Incorrecto, one line, code 1123, "Error en el
bloque de Encadenamiento.. El formato del NIF es incorrecto.. NIF:AAAA.". Read: one
finding AEAT-1123 with the AEAT's text. With the record rebuilt (issuer AAAA, 12345 of
13-09-2024) and dropped beside it, the line pairs with it and VF-019 reproduces the
rejection. Before this change VF-019 checked only the check letter of a NIF-shaped
value, so "AAAA" passed; the reply is what showed the gap.

Side effect on an existing fixture: `aeat-test-entity-envelope.xml` had its buyer's NIF
redacted to `XXXX` by its source project, and VF-019 now flags it as not NIF-shaped,
which is right for that file as it stands.

## Not measured

- No production system's replies, and no AEAT reply for any code but 1123: the mapping
  is the AEAT's Spanish text read against the rules.
- The AEAT's tolerance on totals is still not modelled (VF-015/VF-016 stay warnings,
  though 1210/1216 reject).
