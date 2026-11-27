# INV-041 against OpenPeppol's PEPPOL-COMMON rules (2026-11-17)

`node eval/endpoint-peppol-differential.mjs 300 7` (and seed 11). No network, no
outside data: the oracle is OpenPeppol's own assertions as shipped in
`plain/peppol-ubl.json` (Peppol BIS 3.0.22), evaluated by the bundled
`plain/fontoxpath.esm.js`. For each scheme the script draws 300 ids whose check
digit is found by brute force against Peppol's test (so the generator shares no
code with `endpoint.mjs`) and eight mutants of each: one digit changed, two
adjacent digits swapped, a digit dropped, a digit added, a dot, a space or a
hyphen inside, and a country prefix in front.

## Before (main at f1a204cd9), seed 7

ids: 21,264; disagreements: **13,645**, every one an id Peppol rejects that INV-041 passed.

| scheme | rule | Peppol-valid | Peppol-invalid | we reject a valid one | we accept an invalid one |
|---|---|---|---|---|---|
| 0088 GLN | R040 | 329 | 2250 | 0 | 1200 |
| 0192 NO orgnr | R041 | 300 | 2370 | 0 | 1770 |
| 0184 DK CVR | R042 | 906 | 1764 | 0 | 1180 |
| 0096 DK P | R052 | 871 | 1800 | 0 | 1800 |
| 0198 DK SE | R053 | 873 | 1800 | 0 | 1800 |
| 0208 BE KBO/BCE | R043 | 300 | 2369 | 0 | 1769 |
| 0007 SE orgnr | R049 | 306 | 2362 | 0 | 1762 |
| 0151 AU ABN | R050 | 300 | 2364 | 0 | 2364 |

Why: 0208, 0192, 0007 and 0184 were digit counts after stripping every
non-digit, so a transposed pair, a wrong check digit, `0403.170.701` or
`BE0403170701` passed; 0151, 0096 and 0198 had no check at all; the GLN check
also stripped non-digits, so `123-4567890128` passed. Peppol rejects all of
these as fatal, so an access point would bounce the file.

## After, seeds 7 and 11

Seed 7: 21,264 ids, **0 disagreements**. Seed 11: 21,356 ids, 0 disagreements.
Every row reads 0 and 0 in the last two columns.

One difference is deliberate and not counted: Peppol's `u:gln` accepts any
length of digits whose GS1 check holds (84 such ids at seed 7, 80 at seed 11:
12- and 14-digit strings); INV-041 keeps asking for 13, because a GLN is 13
digits.

## Also fixed: twelve EAS codes called unpublished

INV-039 ("not a published EAS code") fired on twelve codes that EN 16931's own
BR-CL-25 list (`plain/en16931-ubl.json`) accepts: 0147, 0170, 0194, 0203, 0205,
0217, **0225**, 9960, AN, AQ, AS, AU. 0225 is in Peppol's CL008 list as well;
it is the address scheme of the French reform's directory (FRCTC), so a French
invoice addressed for the September 2026 platforms drew a false INV-039. 0217 is
the Dutch KVK establishment number that PEPPOL-COMMON-R057 itself checks. Three
codes stay known though BR-CL-25 no longer lists them (9955, 9956, 9958, retired
Swedish, Belgian and German codes): a lenient INV-039, left as it was.

## Not done

- The warning-level Peppol rules (R044 0201 IPA, R045/R047 Italian codice
  fiscale and partita IVA, R054 0106 KVK, R055 0190 OIN, R057 0217) are not
  copied into INV-041, which is blocking; Peppol itself only warns.
- Only the endpoint (BT-34/BT-49) is checked by INV-041; Peppol applies the
  same rules to `PartyIdentification/ID` and `PartyLegalEntity/CompanyID` with
  those schemes. On a Peppol file the official set still catches those; on
  JSON input they are not read.
- No access point's or SMP's verdict on a real address. A valid checksum is not
  a registered participant.
