# INV-061 against OpenPeppol's warning-level PEPPOL-COMMON rules (2026-11-17)

`node eval/endpoint-peppol-warnings.mjs 300 7` (and seed 11). No network, no
outside data. The oracle is OpenPeppol's own assertions as shipped in
`plain/peppol-ubl.json` (Peppol BIS 3.0.22), each checked to carry
`flag="warning"`, evaluated by the bundled `plain/fontoxpath.esm.js`. For each
scheme the script draws 300 ids Peppol accepts (the partita IVA check digit is
found by brute force against Peppol's own `u:checkPIVAseIT`, so the generator
shares no code with `endpoint.mjs`) and up to twelve mutants of each: a digit
changed, a digit typed as a letter, a letter typed as a digit, two adjacent
characters swapped, a character dropped or added, a dot, a space, a hyphen or
an accented letter inside, a prefix (IT, NL, it, KVK) in front, and lower case.

Before this change no endpoint finding was possible on these schemes except
INV-041's lenient 0190 digit count; the last column counts the ids Peppol warns
on that drew nothing from the preflight.

## Seed 7

```
ids: 23999, disagreements: 0
| scheme | rule | Peppol passes | Peppol warns | we warn, Peppol passes | Peppol warns, we pass | of Peppol's warnings, silent before INV-061 |
|---|---|---|---|---|---|---|
| 0201 | PEPPOL-COMMON-R044 | 1579 | 2100 | 0 | 0 | 2100 |
| 0210 | PEPPOL-COMMON-R045 | 970 | 2510 | 0 | 0 | 2510 |
| 0211 | PEPPOL-COMMON-R047 | 662 | 1577 | 0 | 0 | 1577 |
| 0106 | PEPPOL-COMMON-R054 | 1171 | 2400 | 0 | 0 | 2400 |
| 0190 | PEPPOL-COMMON-R055 | 1172 | 2400 | 0 | 0 | 1200 |
| 9944 | PEPPOL-COMMON-R056-1 | 792 | 3088 | 0 | 0 | 3088 |
| 0217 | PEPPOL-COMMON-R057 | 1178 | 2400 | 0 | 0 | 2400 |
stricter on purpose, not counted: 0210: 11-digit number without its check digit: 259
stricter on purpose, not counted: 0211: 0211 without IT that is not 11 digits: 1296
stricter on purpose, not counted: 0211: 11-digit number without its check digit: 221
```

## Seed 11

```
ids: 24029, disagreements: 0
| scheme | rule | Peppol passes | Peppol warns | we warn, Peppol passes | Peppol warns, we pass | of Peppol's warnings, silent before INV-061 |
|---|---|---|---|---|---|---|
| 0201 | PEPPOL-COMMON-R044 | 1575 | 2100 | 0 | 0 | 2100 |
| 0210 | PEPPOL-COMMON-R045 | 955 | 2537 | 0 | 0 | 2537 |
| 0211 | PEPPOL-COMMON-R047 | 652 | 1615 | 0 | 0 | 1615 |
| 0106 | PEPPOL-COMMON-R054 | 1165 | 2400 | 0 | 0 | 2400 |
| 0190 | PEPPOL-COMMON-R055 | 1175 | 2400 | 0 | 0 | 1200 |
| 9944 | PEPPOL-COMMON-R056-1 | 784 | 3100 | 0 | 0 | 3100 |
| 0217 | PEPPOL-COMMON-R057 | 1171 | 2400 | 0 | 0 | 2400 |
stricter on purpose, not counted: 0210: 11-digit number without its check digit: 253
stricter on purpose, not counted: 0211: 11-digit number without its check digit: 222
stricter on purpose, not counted: 0211: 0211 without IT that is not 11 digits: 1268
```

## Stricter than Peppol, on purpose

- An 11-digit 0210 (codice fiscale of a company) or 0211 (partita IVA) must
  carry the partita IVA check digit. Peppol's `u:checkCF` takes any 11-digit
  integer, and `u:checkPIVAseIT` reads the check digit only after an IT prefix.
  A company's codice fiscale and every partita IVA are issued with that digit,
  so a wrong one is a typo.
- A 0211 without the IT prefix must still be 11 digits. Peppol's rule returns
  true for any text that does not start with IT.
- A 16-character codice fiscale must have digits where Peppol reads
  `castable as xs:integer`, which also takes "+1" or " 1". No drawn id hit this.

## Not done

- R046 (9907, codice fiscale): 9907 is a retired code that INV-039 flags.
- Only the endpoint (BT-34/BT-49) is read; Peppol applies the same rules to
  `PartyIdentification/ID` and `PartyLegalEntity/CompanyID` with these schemes.
- The Python CLI has no warning severity and stays silent on INV-061.
- No registry lookup: a well-formed IPA code or KVK number may not exist.
