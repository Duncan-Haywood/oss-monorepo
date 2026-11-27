# Peppol BIS Self-Billing: its own rules, not Billing's (2026-11-18)

## The fault

In self-billing the buyer writes the invoice for what its supplier delivered (a packing
house paying growers, a platform paying drivers, a utility buying back solar power).
Peppol has a separate specification for it, **BIS Self-Billing 3.0**: BT-24
`urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:selfbilling:3.0`, BT-23
`urn:fdc:peppol.eu:2017:poacc:selfbilling:01:1.0`, type codes 389 (self-billed invoice),
527 (self-billed debit note) and 261 (self-billed credit note).

The checker picked the Peppol add-on with `/peppol\.eu/`, which a Self-Billing id also
matches, so a self-billing file got the **Billing** rules. OpenPeppol's own nine
Self-Billing examples (branch `selfbilling-2026-Q2-QA`, `rules/examples/Self-billing
examples/`), run through the whole preflight as the page runs it:

| Before | Official Peppol findings that block |
|---|---|
| 9 of 9 files | `PEPPOL-EN16931-R004` (BT-24 is not Billing's) and `R007` (BT-23 is not a billing process), fatal |
| 8 of 9 (all but the German pair) | `PEPPOL-EN16931-P0112` (389 only between German parties), fatal |

So every valid self-billing invoice was reported as rejected, and the fix text told the
sender to switch to Billing's identifiers and type code 380, which a Self-Billing access
point would refuse.

## What shipped

- `plain/peppol-sb-ubl.json`: OpenPeppol's `PEPPOL-EN16931-UBL-SB.sch`, **Self-Billing
  3.0.2** (published 2026-05-20, in force 2026-08-17), branch `selfbilling-2026-Q2-QA` at
  `bd9f24e`, 62 checks. OpenPeppol keeps Self-Billing on release branches of
  `peppol-bis-invoice-3`, never on master or a tag; the branch's release notes name 3.0.2.
- `plain/peppol-sb-next-ubl.json`: **Self-Billing 3.1.0** (published 2026-11-23, in force
  2027-02-24, the same dates as Billing 3.1.0), branch `selfbilling-2026-Q4-QA2` at
  `387676d`, 185 checks. It runs when the caller asks for the 3.1.0 preview
  (`peppolNext`, `?peppol=next`, the page's checkbox), and each finding 3.0.2 does not
  raise says "New in Peppol BIS Self-Billing 3.1.0, rejected from 2027-02-24".
- `schematron-core.mjs`: a `peppol-sb` add-on for `poacc:selfbilling:3.0`, and the
  `peppol` (Billing) add-on no longer matches it. UBL only (OpenPeppol publishes no CII
  form) and plain route only, so a Saxon runner hands such a file to the plain route.
  The old A-NZ id (`poacc:selfbilling:international:aunz:3.0`) stays a PINT profile.
- Self-Billing advice for R001, R004, R007, P0100 and P0101 (`selfBillingFix`), since the
  ids are Billing's but the values they want are not.
- The UBL reader: a debit note sent as an `Invoice` (383, or 527) is a debit note.
  UBL 2.1's EN 16931 binding has no DebitNote document, so the built-in INV-034 had
  called every such file a type mismatch (it was already stepped aside for PINT and ZATCA).
- The opt-in Peppol profile (PP-001/PP-002) accepts the Self-Billing BT-24/BT-23 pair.
- `build-plain-rules.mjs` builds both (`EINVOICE_PEPPOL_SB_BRANCH`,
  `EINVOICE_PEPPOL_SB_NEXT_BRANCH`); `eval/peppol-unit-tests.mjs` runs a Self-Billing
  branch's `unit-UBL-PEPPOL-SB` folder against them (`--next` for 3.1.0).

## Checked against OpenPeppol's own unit tests

`node eval/peppol-unit-tests.mjs <checkout of the branch> [plain] [--next]`:

| Rules | Asserts agreeing |
|---|---|
| Self-Billing 3.0.2 on `selfbilling-2026-Q2-QA` | **219 / 219** |
| Self-Billing 3.1.0 on `selfbilling-2026-Q4-QA2` | **349 / 349** |
| Billing 3.0.22 on master (unchanged) | 1,048 / 1,048 |

## OpenPeppol's examples after the change

All nine examples, on both releases: **0 official Peppol findings** (was 9 of 9 blocked).
The built-in checks still block all nine, on the same placeholder data that blocks
OpenPeppol's ten Billing examples (`rules/examples/` on master): made-up VAT numbers that
fail their checksums (INV-022/023), IBANs and BICs that are not real (INV-024/026/027),
and in 3.0.2 a 19-digit value under scheme 0088 (INV-041, the GLN fault 3.1.0's release
notes say they fixed). One built-in finding is Self-Billing's own: the self-billed debit
note (527) names no invoice it adjusts (INV-033). EN 16931 does not require BT-25 there;
the checker asks for it as a built-in check on every debit note, Billing's too, and that
is left as it was.

## Not done

- No real self-billing file from a business, and no access point's verdict on one.
- Self-Billing on CII: OpenPeppol publishes none.
