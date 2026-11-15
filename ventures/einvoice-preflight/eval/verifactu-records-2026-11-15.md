# VERI*FACTU record checker, first measurement (2026-11-15)

`verifactu.mjs` reads Spain's VERI*FACTU billing records (RegistroAlta,
RegistroAnulacion; alone, batched or in the SOAP envelope), recomputes each
fingerprint (Huella), follows the chain across the files and checks the record
(rules VF-001 to VF-028). What was measured, and on what:

## The fingerprint string

AEAT's huella specification (v0.1.2) could not be read here: sede.agenciatributaria.gob.es,
www.agenciatributaria.es and prewww2.aeat.es all refuse this session's proxy. Its two
worked examples, as quoted by squareetlabs/LaravelVerifactu's tests (MIT, 7838799):

| Example | Expected | This checker |
| --- | --- | --- |
| 1, first record, `Huella=` empty | 3C464DAF…8F12F60 | 3C464DAF…8F12F60 |
| 2, chained to 1 | F7B94CFD…802A2B97 | F7B94CFD…802A2B97 |

## Real records

| File | Records | Fingerprints matching | Findings |
| --- | ---: | ---: | --- |
| AEAT test-entity SOAP envelope (verifactu-rb) | 1 | 1 | none |
| josemmo RegistroAlta F1 | 1 | 1 | 2 VF-019 warnings: 00000000B and 11111111B are made-up NIFs whose check letter fails (T and H expected) |
| josemmo RegistroAnulacion | 1 | 1 | none |

The AEAT test-entity record settles one point the spec excerpts leave open: its
ImporteTotal is written `15`, and the stored fingerprint is reproduced with `15`
only; hashing `15.00` gives 5DC4A3BA…, not the stored E160BD5C…. So the string takes
the amount as written in the XML, and a system that formats the amount one way for
the XML and another for the hash breaks its own chain. That is the case the
diagnosis below exists for.

## Seeded slips (`node eval/verifactu-diagnosis.mjs 500`)

500 random records per slip; each stored fingerprint was computed the way a buggy
system would. "Named" means VF-001's `diagnosis` lists that slip.

| slip | records | slip left the string unchanged | VF-001 raised | slip named | other variant named |
| --- | ---: | ---: | ---: | ---: | ---: |
| amounts-2dp | 500 | 451 | 49 | 49 | 0 |
| amounts-short | 500 | 410 | 90 | 90 | 0 |
| no-prev | 500 | 0 | 500 | 500 | 0 |
| prev-lower | 500 | 0 | 500 | 500 | 0 |
| tz-z | 500 | 0 | 500 | 500 | 0 |
| tz-none | 500 | 0 | 500 | 500 | 0 |
| ms | 500 | 0 | 500 | 500 | 0 |
| iso-date | 500 | 0 | 500 | 500 | 0 |
| url-encoded | 500 | 0 | 500 | 500 | 0 |
| value-changed | 500 | 0 | 500 | 0 | 0 |

Every slip that changed the string was flagged and named (4,590 of 4,590). A changed
value (`value-changed`) is flagged and never explained away as a formatting slip
(0 of 500 named). The amount slips leave most strings unchanged because most random
amounts already have two non-zero decimals.

## What is not measured

- No production system's records: the one AEAT-environment record is a test entity's.
- AEAT's error codes (the `CodigoErrorRegistro` list) and its tolerance on totals are
  not read; total differences are warnings.
- The record rules follow josemmo/Verifactu-PHP's validations (a second reader of the
  AEAT texts), not the AEAT's validation document itself.
