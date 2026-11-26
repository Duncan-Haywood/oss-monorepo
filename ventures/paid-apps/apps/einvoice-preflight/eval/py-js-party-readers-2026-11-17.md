# Python and page readers: party identifiers, 2026-11-17

Question: do the CLI's XML readers (`src/einvoice_preflight/ubl.py`,
`formats.py`) give a party the same `legal_id`, `party_ids` and `endpoint`
as the page's readers (`ubl.mjs`, `cii.mjs`)? Those three fields are what
INV-041 and INV-062 (`endpoint.py` / `endpoint.mjs`) check.

Method: `node eval/py-js-party-readers.mjs` walks every `.xml` file in the
venture, keeps those either page reader parses as UBL or CII (34), reads each
with both sides and compares the three fields for supplier and customer. No
network, deterministic.

| | files equal | files that differ |
|---|---|---|
| before (main at dea61ac0b) | 10 | 24 |
| after this change | 34 | 0 |

30 of the 34 carry at least one of the fields. Before, the Python UBL reader
dropped `legal_id` and `party_ids`, and the CII reader dropped all three.

Effect on findings (CLI `check_invoice` over the same files, INV-005/041/062):
before, only the five ZATCA simplified examples' INV-005; after, those plus
INV-062 twice (supplier and customer `party_ids/0`) on
`fixtures/fr-fnfe/uc1-en16931-{ubl,cii}.xml`, `uc10-multi-vendeur-extended-ctc-fr-cii.xml`
and `uc12-sous-ligne-extended-fx-cii.xml`. The page's `checkInvoice` raises
exactly those paths on those files. The ids are `0088` (GLN) values of 10 and
12 digits, which PEPPOL-COMMON-R040 rejects; these are FNFE samples for the
French reform, not Peppol files, so the finding is right for a Peppol route
and says so ("the 0088 format OpenPeppol rejects on").

Limits: 34 files, all from public specimen sets, none from a real business.
INV-063 (warning level) stays silent in Python, as INV-061 does.
