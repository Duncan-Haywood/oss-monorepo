# VERI*FACTU record fixtures

| File | Source | Licence |
| --- | --- | --- |
| `aeat-test-entity-envelope.xml` | `sample.xml` of [mybooking-es/verifactu-rb](https://github.com/mybooking-es/verifactu-rb) at c46a9f0 (2026-10-19): a SOAP envelope sent to the AEAT's test environment for its test entity A39200019 ("CERTIFICADO ENTIDAD PRUEBAS"), namespaces and the recipient redacted to `XXX` by that project. Its first line ("XML ENERO 2025 (DESACTUALIZADO)", i.e. January 2025, out of date) was dropped so the file parses. | MIT |
| `josemmo-registro-alta-f1.xml` | `tests/Models/Records/registration-record-f1.xml` of [josemmo/Verifactu-PHP](https://github.com/josemmo/Verifactu-PHP) at 0fd9d89 | MIT |
| `josemmo-registro-anulacion.xml` | `tests/Models/Records/cancellation-record.xml`, same repository | MIT |
| `aeat-errores.properties.txt` | The AEAT's list of VERI*FACTU error codes, byte for byte as served at `https://prewww2.aeat.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/errores.properties` (read 2026-11-15, Last-Modified Thu, 30 Jul 2026 11:45:16 GMT, ISO-8859-1; named .txt only so the site serves it as text; SHA-256 `06519ceb23422bd6b0ad3bfb659e3007615050da4920781d12cff536481d5902`; the same hash Iescudero157/cuentas-eu recorded on 2026-09-20). | Public-sector information of the Agencia Tributaria, reused with attribution under Ley 37/2007 |
| `curried-response-1123.xml` | `tests/data/recorded_responses/bad_nif.xml` of [curriedsoftware/verifactu](https://github.com/curriedsoftware/verifactu) (main, read 2026-11-15): an AEAT reply rejecting a record with code 1123, the company name and NIF anonymised by that project. | MIT |

The AEAT's two worked examples from its huella specification (v0.1.2, 27/08/2024)
are in `verifactu.test.mjs` as strings, with the expected values quoted by
squareetlabs/LaravelVerifactu (MIT) and reproduced here.
