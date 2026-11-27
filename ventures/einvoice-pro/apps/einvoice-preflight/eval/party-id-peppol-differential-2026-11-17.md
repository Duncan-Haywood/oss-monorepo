# INV-062/063 against OpenPeppol's PEPPOL-COMMON id rules, whole files (2026-11-17)

`npm i --no-save --no-package-lock slimdom fontoxpath` (DOM for the oracle), then
`node eval/party-id-peppol-differential.mjs 60 7` and `... 60 11`. No network, no outside data.

For each of the 15 schemes Peppol checks on party ids, the script draws ids
(check digits found by brute force against Peppol's own test) and mutants (a digit
changed or typed as a letter, two swapped, one dropped or added, a dot, space or
hyphen inside, a country prefix, lower case). Each goes into one of eight places
of a shipped example (`examples/peppol-credit-note.xml`, `examples/cii-invoice.xml`):
seller or buyer, `PartyIdentification/ID` / `GlobalID` or `PartyLegalEntity/CompanyID` /
`SpecifiedLegalOrganization/ID`, UBL or CII. Oracle: Peppol's COMMON assertions from
`plain/peppol-ubl.json` / `peppol-cii.json`, run on that XML with fontoxpath over a
slimdom DOM. Ours: `parseUblInvoice`/`parseCiiInvoice` then `checkInvoice`, INV-062
or INV-063 at that party's path. A row also counts the wrong rule or severity
(a fatal Peppol rule must be INV-062, blocking; a warning one INV-063, a warning).

Before this change no check read the format of these elements (the readers did not
keep schemed party ids, and `legal_id` was read only by the French profile for 0002).

## Seed 7

files: 9431, disagreements: 0; Peppol's rule fails on 6785 of them (before INV-062/063 no check read these elements' format)
| scheme | Peppol rule | files | Peppol fails | we miss one | we flag a passing one | wrong rule or severity |
|---|---|---|---|---|---|---|
| 0088 | PEPPOL-COMMON-R040 | 639 | 512 | 0 | 0 | 0 |
| 0192 | PEPPOL-COMMON-R041 | 651 | 531 | 0 | 0 | 0 |
| 0184 | PEPPOL-COMMON-R042 | 651 | 431 | 0 | 0 | 0 |
| 0096 | PEPPOL-COMMON-R052 | 651 | 420 | 0 | 0 | 0 |
| 0198 | PEPPOL-COMMON-R053 | 657 | 488 | 0 | 0 | 0 |
| 0208 | PEPPOL-COMMON-R043 | 653 | 533 | 0 | 0 | 0 |
| 0007 | PEPPOL-COMMON-R049 | 654 | 533 | 0 | 0 | 0 |
| 0151 | PEPPOL-COMMON-R050 | 629 | 509 | 0 | 0 | 0 |
| 0201 | PEPPOL-COMMON-R044 | 621 | 360 | 0 | 0 | 0 |
| 0210 | PEPPOL-COMMON-R045 | 609 | 426 | 0 | 0 | 0 |
| 0211 | PEPPOL-COMMON-R047 | 405 | 282 | 0 | 0 | 0 |
| 0106 | PEPPOL-COMMON-R054 | 648 | 420 | 0 | 0 | 0 |
| 0190 | PEPPOL-COMMON-R055 | 651 | 420 | 0 | 0 | 0 |
| 9944 | PEPPOL-COMMON-R056-1 | 658 | 500 | 0 | 0 | 0 |
| 0217 | PEPPOL-COMMON-R057 | 654 | 420 | 0 | 0 | 0 |
stricter on purpose, not counted: 0088: a GLN that is not 13 digits: 12
stricter on purpose, not counted: 0151: an ABN that is not 11 digits (Peppol's CII rule has no length test): 29
stricter on purpose, not counted: 0210: 11-digit number without its check digit: 47
stricter on purpose, not counted: 0211: 11-digit number without its check digit: 43
stricter on purpose, not counted: 0211: 0211 without IT that is not 11 digits: 209

## Seed 11

files: 9363, disagreements: 0; Peppol's rule fails on 6751 of them (before INV-062/063 no check read these elements' format)
| scheme | Peppol rule | files | Peppol fails | we miss one | we flag a passing one | wrong rule or severity |
|---|---|---|---|---|---|---|
| 0088 | PEPPOL-COMMON-R040 | 644 | 520 | 0 | 0 | 0 |
| 0192 | PEPPOL-COMMON-R041 | 655 | 535 | 0 | 0 | 0 |
| 0184 | PEPPOL-COMMON-R042 | 654 | 443 | 0 | 0 | 0 |
| 0096 | PEPPOL-COMMON-R052 | 654 | 420 | 0 | 0 | 0 |
| 0198 | PEPPOL-COMMON-R053 | 652 | 497 | 0 | 0 | 0 |
| 0208 | PEPPOL-COMMON-R043 | 655 | 535 | 0 | 0 | 0 |
| 0007 | PEPPOL-COMMON-R049 | 653 | 532 | 0 | 0 | 0 |
| 0151 | PEPPOL-COMMON-R050 | 629 | 509 | 0 | 0 | 0 |
| 0201 | PEPPOL-COMMON-R044 | 601 | 360 | 0 | 0 | 0 |
| 0210 | PEPPOL-COMMON-R045 | 600 | 422 | 0 | 0 | 0 |
| 0211 | PEPPOL-COMMON-R047 | 351 | 227 | 0 | 0 | 0 |
| 0106 | PEPPOL-COMMON-R054 | 654 | 420 | 0 | 0 | 0 |
| 0190 | PEPPOL-COMMON-R055 | 652 | 420 | 0 | 0 | 0 |
| 9944 | PEPPOL-COMMON-R056-1 | 654 | 491 | 0 | 0 | 0 |
| 0217 | PEPPOL-COMMON-R057 | 655 | 420 | 0 | 0 | 0 |
stricter on purpose, not counted: 0088: a GLN that is not 13 digits: 8
stricter on purpose, not counted: 0151: an ABN that is not 11 digits (Peppol's CII rule has no length test): 27
stricter on purpose, not counted: 0210: 11-digit number without its check digit: 53
stricter on purpose, not counted: 0211: 0211 without IT that is not 11 digits: 248
stricter on purpose, not counted: 0211: 11-digit number without its check digit: 58

## The deliberate differences

- **0151 in CII.** Peppol's UBL R050 is `matches(normalize-space(), '^[0-9]{11}$') and u:abn(normalize-space())`;
  its CII R050 is `u:abn(normalize-space())` alone, and `u:abn` reads only the first
  11 characters. So a 12-digit "ABN" passes Peppol in a CII file. INV-062 asks for 11
  digits in both syntaxes. This only shows on whole CII files; the earlier
  id-level differentials read the UBL rule file.
- GLN length, and the Italian 11-digit check digit and 0211 length: as INV-041 and
  INV-061 already keep (see endpoint-peppol-differential-2026-11-17.md and
  endpoint-peppol-warnings-2026-11-17.md).

## Not done

- PayeeParty and TaxRepresentativeParty: Peppol's contexts match their ids too; the
  readers do not map those parties.
- A `CompanyID` with a schemeID inside `PartyTaxScheme` (Peppol's `cbc:CompanyID`
  context matches it as well; rare in practice). R056-2 (NL VAT in PartyTaxScheme).
- The Python CLI's XML readers do not fill `legal_id`/`party_ids`; it checks them on JSON.
- No registry lookup and no access point verdict on any real file.
