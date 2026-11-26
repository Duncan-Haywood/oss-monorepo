# INV-062/063 on the payee (BG-10) and tax representative (BG-11), whole files (2026-11-17)

`npm i --no-save --no-package-lock slimdom fontoxpath`, then
`node eval/party-id-peppol-differential.mjs 60 7` and `... 60 11`. No network, no outside data.

OpenPeppol's PEPPOL-COMMON id contexts are `cac:PartyIdentification/cbc:ID[@schemeID = 'X'] |
cbc:CompanyID[@schemeID = 'X']` (UBL) and `ram:ID | ram:GlobalID` (CII) with no parent
named, so they match a payee's (`cac:PayeeParty`, `ram:PayeeTradeParty`) and a tax
representative's (`cac:TaxRepresentativeParty`, `ram:SellerTaxRepresentativeTradeParty`)
ids as they do the seller's and buyer's. A factoring company's mistyped GLN as BT-60
blocks the file at the access point. Until this change the readers did not keep those
parties at all.

The differential (`eval/party-id-peppol-differential-2026-11-17.md` for the method) now
writes each drawn id or mutant into one of **sixteen** places: the earlier eight plus
payee or tax representative, identifier or legal registration, UBL or CII.

## Before (old readers, new places), seed 7

files: 9,596, disagreements: **3,311**, every one a Peppol failure in a payee or
tax-representative place that no check read (between 138 and 272 per scheme).

## After, seed 7

files: 9,430, disagreements: **0**; Peppol's rule fails on 6,784.

## After, seed 11

files: 9,360, disagreements: **0**; Peppol's rule fails on 6,748.

Per-scheme tables: every row 0 / 0 / 0 (miss, false flag, wrong rule or severity) on both
seeds, across all 15 schemes (R040-R057). The deliberate stricter-than-Peppol cases
(GLN length, ABN length in CII, Italian check digit and 0211 length) are counted apart as
before.

## What changed

- `ubl.mjs` / `cii.mjs`: the legal_id/party_ids reading is one helper (`schemedIds`) used
  for the seller, buyer, payee and tax representative; the invoice gains
  `payee_party` and `tax_representative` (`{legal_id?, party_ids?}`) when a file names a
  schemed id there.
- `checks.mjs`: INV-062/INV-063 run on both, labelled "Payee" and "Tax representative",
  paths `/payee_party/...` and `/tax_representative/...`. JSON input gets the same.
- Python CLI (`ubl.py`, `formats.py`, `checks.py`, `endpoint.py`): the same fields and the
  INV-062 check (INV-063 stays silent in the CLI, as INV-061 does).
- Tests: `party-ids.test.mjs` (+2), `tests/test_side_party_ids.py` (2).

Not done: R056-2 (an NL VAT number in PartyTaxScheme); ids Peppol's contexts also reach
in a DeliveryParty or a CII ShipToTradeParty; any registry lookup.
