# INV-062/063 on the deliver-to party (BG-13), whole files (2026-11-17)

`npm i --no-save --no-package-lock slimdom fontoxpath`, then
`node eval/party-id-peppol-differential.mjs 60 7` and `... 60 11`. No network, no outside data.

OpenPeppol's PEPPOL-COMMON id contexts (`cac:PartyIdentification/cbc:ID[@schemeID = 'X'] |
cbc:CompanyID[@schemeID = 'X']` in UBL, `ram:ID | ram:GlobalID` in CII) name no parent. After
the payee and tax representative (`side-party-ids-peppol-differential-2026-11-17.md`), the
other party they reach on an EN 16931 invoice is the deliver-to party:

- UBL: `cac:Delivery/cac:DeliveryParty`'s `PartyIdentification/ID` and
  `PartyLegalEntity/CompanyID`. BT-71, the delivery location id, is
  `cac:DeliveryLocation/cbc:ID`: not under `PartyIdentification`, so no Peppol rule reads it.
- CII: `ApplicableHeaderTradeDelivery/ShipToTradeParty`'s `ID` (which *is* BT-71 there, with
  its scheme), `GlobalID`, and `SpecifiedLegalOrganization/ID`.

A wholesaler that puts a store's GLN with a wrong check digit as the delivery location of a
CII invoice is rejected at the access point (R040, fatal); the same GLN in UBL's
DeliveryLocation passes. Until this change the readers kept neither.

The differential now writes into **twenty-two** places: the sixteen before, plus UBL
DeliveryParty identifier or legal registration, CII ShipToTradeParty ID, GlobalID or legal
registration, and UBL DeliveryLocation ID (where both sides must stay silent; a flag there
would count as a false flag).

## Before (old readers, new places), seed 7

files: 9,521, disagreements: **1,508**, every one a Peppol failure in a deliver-to place that
no check read.

## After

seed 7: files 9,445, disagreements **0**; Peppol's rule fails on 6,478.
seed 11: files 9,379, disagreements **0**; Peppol's rule fails on 6,438.

Every per-scheme row is 0 / 0 / 0 (miss, false flag, wrong rule or severity) across the 15
schemes, on both seeds. The deliberate stricter-than-Peppol cases (GLN length, ABN length in
CII, Italian check digit and 0211 length) are counted apart as before.

## What changed

- `ubl.mjs`: `delivery_party` from every header `cac:Delivery/cac:DeliveryParty` (first legal
  id, all schemed party ids). `cii.mjs`: from `ShipToTradeParty` via the same `sideParty`.
- `checks.mjs`: INV-062/063 on it, labelled "Deliver-to party", paths `/delivery_party/...`.
- Python CLI (`ubl.py`, `formats.py`, `checks.py`): the same field and INV-062.
- Tests: `party-ids.test.mjs` (+2), `tests/test_side_party_ids.py` (+2).

Not done: R056-2; CII line-level `GlobalID`s (BT-157 item ids) that Peppol's `ram:GlobalID`
context also reaches when their scheme is a COMMON one (0088 for a GTIN-as-GLN, say), where
UBL's `StandardItemIdentification/ID` is not reached.
