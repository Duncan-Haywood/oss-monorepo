# VERI*FACTU record fixtures

| File | Source | Licence |
| --- | --- | --- |
| `aeat-test-entity-envelope.xml` | `sample.xml` of [mybooking-es/verifactu-rb](https://github.com/mybooking-es/verifactu-rb) at c46a9f0 (2026-10-19): a SOAP envelope sent to the AEAT's test environment for its test entity A39200019 ("CERTIFICADO ENTIDAD PRUEBAS"), namespaces and the recipient redacted to `XXX` by that project. Its first line ("XML ENERO 2025 (DESACTUALIZADO)", i.e. January 2025, out of date) was dropped so the file parses. | MIT |
| `josemmo-registro-alta-f1.xml` | `tests/Models/Records/registration-record-f1.xml` of [josemmo/Verifactu-PHP](https://github.com/josemmo/Verifactu-PHP) at 0fd9d89 | MIT |
| `josemmo-registro-anulacion.xml` | `tests/Models/Records/cancellation-record.xml`, same repository | MIT |

The AEAT's two worked examples from its huella specification (v0.1.2, 27/08/2024)
are in `verifactu.test.mjs` as strings, with the expected values quoted by
squareetlabs/LaravelVerifactu (MIT) and reproduced here.
