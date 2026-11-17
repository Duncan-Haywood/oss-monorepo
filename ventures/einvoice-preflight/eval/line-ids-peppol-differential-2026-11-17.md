# INV-062/063 on CII line ids (BT-157 and line parties), whole files (2026-11-17)

`npm i --no-save --no-package-lock slimdom fontoxpath`, then
`node eval/party-id-peppol-differential.mjs 60 7` and `... 60 11`. No network, no outside data.

Peppol's CII COMMON id contexts are `ram:URIID[@schemeID = 'X'] | ram:ID[@schemeID = 'X'] |
ram:GlobalID[@schemeID = 'X']`, with no parent. After the seller, buyer, payee, tax
representative and deliver-to party (`delivery-party-ids-peppol-differential-2026-11-17.md`),
the remaining reach on an invoice is inside the lines:

- **BT-157, the item standard identifier** (`SpecifiedTradeProduct/ram:GlobalID`). A GTIN's
  right scheme is 0160, which Peppol has no COMMON rule for. Filed under 0088 (the GLN
  scheme, an easy slip since both are GS1 numbers), it meets R040's mod-10 check, so a mistyped
  digit or a dash bounces the file (fatal).
- **Extended line-level parties**, e.g. a line `ShipToTradeParty/ram:ID`: matched the same way.

UBL is not affected: its item id is `cac:StandardItemIdentification/cbc:ID`, which is outside
`cac:PartyIdentification`.

`cii.mjs` now keeps every schemed `ID`, `GlobalID` and `URIID` in a line as
`lines[i].scheme_ids`, `endpoint.mjs` `inspectLineSchemedIds` runs the same INV-062/063
checks on it ("Line N identifier ..."), and schemes without a Peppol rule (0160, VA, ...)
are left alone. The Python CLI mirrors it (`formats.py`, `endpoint.py`, `checks.py`).

The differential gains two places (CII item GlobalID; CII line ShipToTradeParty ID), 24 in
all; our path for them is `/lines/0/scheme_ids/...`.

## Before (main as of PR #16970, new places), seed 7

files: 9,472, disagreements: **581**, every one a Peppol failure in a line id no check read.

## After

| seed | files | Peppol's rule fails | disagreements |
|---|---|---|---|
| 7 | 9,439 | 6,516 | **0** |
| 11 | 9,377 | 6,485 | **0** |

Every per-scheme row is 0 / 0 / 0 on both seeds. The deliberate stricter-than-Peppol cases are
counted apart as before. One applies here with more weight: Peppol's R040 is a mod-10 test of
any length, so a correct GTIN-14 or UPC-12 under 0088 passes Peppol, while INV-062 still
asks 0088 for 13 digits (a GLN is 13 digits; the fix is the 0160 scheme either way).

Tests: `party-ids.test.mjs` (+1), `tests/test_side_party_ids.py` (+1).

Not done: R056-2 on the tax representative's VAT number; UBL line-level
`Delivery/DeliveryParty`, which UBL's open `PartyIdentification` context also reaches.
