# Peppol BIS Billing 3.0.22 and the pattern-let fix (2026-11-14)

## What was shipped before

`plain/peppol-ubl.json` and `plain/peppol-cii.json` (the rules the page and the plain
server route run) were compiled on 2026-10-21 from OpenPEPPOL/peppol-bis-invoice-3 at
`261c458` (2026-03-16, tag v3.0.20). Since then OpenPeppol published:

- **3.0.21**, published 2026-05-20, **mandatory from 2026-08-17** (tag dated 2026-10-28);
- **3.0.22**, the October 2026 hotfix (RFC-607), master `38d693d` of 2026-11-04.

So for three months the checker applied a superseded release to every Peppol file.
(The EN 16931 base was already current: validation 1.3.17, `6e35e0a`; upstream master
`b17b269` only changes a test script.)

## Measured against OpenPeppol's own unit tests

`node eval/peppol-unit-tests.mjs <peppol-bis-invoice-3 checkout> [plain-dir]` runs every
`<test>` in `rules/unit-UBL-*` and `rules/unit-CII-*` through the compiled Peppol set and
compares it with each `<success>`, `<error>` and `<warning>` assertion.

| Rules | Unit tests | Asserts agreeing |
|---|---|---|
| shipped (3.0.20, old compiler) | 3.0.20 (`261c458`) | 775 / 899 |
| shipped (3.0.20, old compiler) | 3.0.22 (`38d693d`) | 808 / 1,048 |
| **this PR (3.0.22, fixed compiler)** | 3.0.22 (`38d693d`) | **1,048 / 1,048** |

Every one of the 124 misses against the shipped release's *own* tests was Danish
(`unit-UBL-DK` 66/137, `unit-CII-DK` 67/120): a compiler bug, below, not a version gap.

## The compiler bug: schema and pattern `<let>`s are evaluated at the document root

`plain-compile.mjs` has no run-time variables; it pastes each `<let>` value in place of
`$name`. A Schematron `<let>` at schema or pattern level compiles to a global
`xsl:variable`, evaluated once with the **document node** as context. Pasted into a rule
context such as `ubl-invoice:Invoice[$DKSupplierCountry = 'DK']`, the value
`concat(ubl-creditnote:CreditNote/..., ubl-invoice:Invoice/cac:AccountingSupplierParty/...)`
was evaluated from the `Invoice` element instead, found nothing, and the predicate was
never true. So **DK-R-002 to DK-R-017 never fired** on the plain route, and neither did
the Icelandic IS-R-* rules (same let shape). The fix substitutes a value that reads the
document by a relative path as `root(.)/(value)`; constants and absolute paths are left
as they were (`fromRoot()` in `plain-compile.mjs`).

The same fix changes other compiled sets wherever a global or pattern let has a
relative path. Rebuilt from the same pinned sources (no version change):

- `xrechnung-ubl/cii.json` (same commit `7e3ddbe`): `isExtension` and `isCVD`. In the
  CII set `isCVD` reads `rsm:CrossIndustryInvoice/...` relatively, so the Clean Vehicles
  Directive rules BR-DE-CVD-01..06 and BR-TMP-CVD-01 could never fire on a CII file.
- `nlcius-ubl/cii.json`, `pint-aunz-peppol-ubl`, `pint-aunz-sb-peppol-ubl`,
  `pint-sg-peppol-ubl`, `pint1-aunz-jur-ubl`, `pint1-aunz-sb-jur-ubl`,
  `pint1-om-jur-ubl`, `pint1-om-sb-jur-ubl` (same phive-rules 4.6.3/4.6.4 jars): global
  `xsl:variable`s now rooted.
- `zatca-*`, `cius-ro-ubl`, `cius-pt-ubl`, `en16931-*`: byte-identical after the rebuild.

`eval/phive-corpus.mjs --good --files` on phive-rules `37a2664` (PINT A-NZ 24, SG 16,
JP 9, JP-NTR 7, MY 24, AE 14, OM 46, NLCIUS 41 + 1 CII good-case files) gives
byte-identical output before and after: the fix adds findings only where a rule was
wrongly silent, and no good case was disturbed.

## What 3.0.21 and 3.0.22 change, as the checker now reports it

Release notes: `guide/release-notes/v3.0.21.adoc` and `v3.0.22-hotfix.adoc` in the
OpenPeppol repository. Rule diff of the compiled sets (`peppol-ubl` 159 to 165 checks,
`peppol-cii` 86 to 91): 6 added, 0 removed, 4 severity changes, 17 tests changed (UBL);
most of the remaining text changes are the rule id now prefixed to every message.

Pinned in `peppol-bis-3022.test.mjs` on made-up variants of `examples/peppol-credit-note.xml`:

| Case | 3.0.20 (shipped) | 3.0.22 (now) |
|---|---|---|
| ProfileID `urn:peppol:france:billing:regulated` / `non-regulated` | R007 fatal | pass |
| ProfileID `urn:peppol:bis:billing_with_response` (OpenPeppol's `base-example_profile02.xml`) | R007 fatal | pass |
| ProfileID `...billing:03:1.0` | pass | R007 fatal |
| BT-24 `...billing:3.0::2.1` | pass | R004 fatal |
| 384 corrected invoice, Slovak seller and buyer | P0112 fatal | pass |
| 389 self-billed, Belgian pair | P0100 | P0100 + P0112 |
| Danish P number (0096) not ten digits | R052 warning | R052 fatal |
| Dutch KVK (0106) not eight digits | pass | R054 warning |
| Currency BGN (Bulgaria joined the euro) | EU base only (BR-CL-04) | also CL007 |

OpenPeppol's ten 3.0.22 example files: 9/10 had no blocking finding with the shipped
rules (profile 02 refused by R007), 10/10 now. The national examples (GR 0/2, NO 1/1)
score the same before and after; the GR files fail the EU base's BR-CO-09 on their own.

The built-in JSON route followed: PP-001 accepts the four business processes R007 now
admits (`PEPPOL_PROCESSES` in `profile.mjs`), PP-002 refuses a `::` suffix as R004 does,
and the English fixes for R007, P0112 and CL007 say what changed.

## Not done

- The Saxon route (`build-schematron.mjs`) clones OpenPeppol's master when a server image
  is built, so a fresh build already runs 3.0.22; it was not rebuilt here (no Java/Saxon
  build in this session). It runs real XSLT, so the let bug never applied to it.
- `endpoint.mjs`'s KNOWN_SCHEMES still lists 0037, 0154, 0177, 0202 and others that
  3.0.21 dropped from Peppol's EAS list ("EAS was pointing to a wrong codelist"). INV-039
  is a typo check, not the code-list rule; Peppol's own CL rules now report those codes.
- The new optional SBDH envelope rules (`PeppolBIS-Envelope-Rules.sch`, `unit-SBDH`) are
  not compiled: the checker reads invoices, not envelopes.
- No real access point's verdict on a 3.0.22 file has been compared.
