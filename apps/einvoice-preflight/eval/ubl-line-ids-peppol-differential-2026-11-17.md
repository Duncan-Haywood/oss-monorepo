# INV-062/063 on UBL line-level party ids (2026-11-17)

`npm i --no-save --no-package-lock slimdom fontoxpath`, then
`node eval/party-id-peppol-differential.mjs 60 7` and `... 60 11`. No network, no outside data.

Peppol's UBL COMMON id contexts are `cbc:EndpointID[@schemeID = 'X'] |
cac:PartyIdentification/cbc:ID[@schemeID = 'X'] | cbc:CompanyID[@schemeID = 'X']`, with no
parent. So they also reach parties inside an invoice line, which EN 16931 does not name but
UBL 2.1 allows and Peppol's rules still read:

- a line-level `cac:Delivery/cac:DeliveryParty` (its `PartyIdentification/ID` and its
  `PartyLegalEntity/CompanyID`);
- an `OriginatorParty` on the line, or an Item's `ManufacturerParty`.

A mistyped GLN or a Swedish org number with a bad Luhn digit there bounces the file (fatal),
and until this change no check here read it: `ubl.mjs` only looked at the header `cac:Delivery`.

Unlike CII, the UBL item id (BT-157, `cac:StandardItemIdentification/cbc:ID`) is under no
COMMON context, so a GTIN filed as 0088 passes Peppol in UBL; both sides stay silent there.

`ubl.mjs` (`lineSchemeIds`) and `ubl.py` (`_line_scheme_ids`) now keep every schemed
`EndpointID`, `PartyIdentification/ID` and `CompanyID` inside a line as `lines[i].scheme_ids`,
the field CII lines already fill, so `inspectLineSchemedIds` / `inspect_line_schemed_ids`
report them as "Line N identifier ...". Schemes without a Peppol rule are left alone.

The differential gains four UBL line places (line DeliveryParty id; line DeliveryParty legal
registration; Item ManufacturerParty id; the item's StandardItemIdentification id, where both
must stay silent): 28 places in all.

## Before (main as of PR #16973, new places), seed 7

files: 9,490, disagreements: **711**, every one a Peppol failure in a UBL line party id no
check read.

## After

| seed | files | Peppol's rule fails | disagreements |
|---|---|---|---|
| 7 | 9,457 | 6,299 | **0** |
| 11 | 9,385 | 6,307 | **0** |

Every per-scheme row is 0 / 0 / 0 on both seeds. Same draws give the same Peppol failures
(6,299 on seed 7 before and after); the file count moves only because cases where we are
stricter than Peppol on purpose (a GLN that is not 13 digits, an Italian number without its
check digit) are counted apart, and the line places now produce some.

Tests: `party-ids.test.mjs` (+1: line delivery party id and legal registration, manufacturer,
GTIN item id silent), `tests/test_side_party_ids.py` (+1). Venture suite: 2,662 tests pass.

Not done: R056-2 on the tax representative's VAT number.
