# Peppol BIS Billing 3.1.0, previewed before it is in force (2026-11-18)

## Why

OpenPeppol's November release, **BIS Billing 3.1.0**, is published on **2026-11-23** and
access points must apply it from **2027-02-24** (`guide/release-notes/v3.1.0.adoc` on
branch `2026-Q4-QA2` of OpenPEPPOL/peppol-bis-invoice-3). From that day a file that
passes today's 3.0.22 can be rejected. A sender has three months to find out which of
their files that is; until now the checker could only say what 3.0.22 thinks.

## What shipped

- `plain/peppol-next-ubl.json` (294 checks; 3.0.22 has 165) and `plain/peppol-next-cii.json`
  (95; 3.0.22 has 91), compiled by `build-plain-rules.mjs` from branch `2026-Q4-QA2` at
  `90f078a` (2026-11-06, the newest commit on any release branch; master `38d693d` is in
  it). `EINVOICE_PEPPOL_NEXT_BRANCH` picks another branch.
- `peppolNext: true` (API `?schematron=1&peppol=next`, the page's "check against Peppol
  BIS 3.1.0" box) runs 3.1.0 *in place of* 3.0.22 on a file whose BT-24 names Peppol.
  3.0.22 still runs underneath, and every 3.1.0 finding that 3.0.22 does not raise (same
  rule, location and severity) is marked `peppolNext: "new"`, with
  "New in Peppol BIS 3.1.0, rejected from 2027-02-24" added to a fatal one's message. A
  warning that becomes fatal (R054-R057) counts as new.
- Plain route only: `plainOnlySets` sends such a file there even where Saxon is built.

## Checked against OpenPeppol's own unit tests

`node eval/peppol-unit-tests.mjs <checkout at 90f078a> <dir with the next sets>`:

| Rules | Asserts agreeing |
|---|---|
| 3.1.0 as first compiled | 1,137 / 1,138 |
| **3.1.0, compiler fixed (below)** | **1,138 / 1,138** |

The one miss was `unit-UBL-PEPPOL/PEPPOL-COMMON-R058.xml`: LU00000101, a valid
Luxembourg VAT number (000001 mod 89 = 01), drew the new R058 warning.

## A fontoxpath bug, and what it did to ZATCA

fontoxpath 3.34's `format-integer` ignores a zero-padded picture:
`format-integer(1, '00')` returns `"1"`, not `"01"`. Peppol's `u:mod89-LU_VAT` compares
the check digits as such a string, so any LU number with check digits 00-09 failed.

The same call sat inside `plain-compile.mjs`'s own stand-in for `format-number`
(`u:fmt`, which fontoxpath lacks), so **15.05 was written "15.5"**. Only ZATCA's sets use
`format-number`. ZATCA's cut of **BR-CO-17 and BR-S-09** (subtotal VAT = taxable amount x
rate, within a cent per line) rounds the expected VAT through it, so when the true VAT
had 01-09 cents the bound moved by up to 0.45: 15% of 100.35 is 15.05, read 15.5, and a
stated 15.40 passed. Fixed in the compiler: a call to `format-integer` goes to
`u:format-integer`, which zero-pads all-zero pictures, and `u:fmt` pads its cents
itself. `plain/zatca-*.json` rebuilt (`node build-zatca-rules.mjs`, phive-rules-zatca 4.6.3);
the only change is that prolog line. `zatca-cents.test.mjs` fails on the old sets and
passes on the new. BR-KSA-51 and BR-KSA-EN16931-03 compare two strings made by `u:fmt`
(115.05 and 115.50 both read "115.5"); BR-KSA-51 has a second assert in decimal
arithmetic that already caught the case tried. No other compiled set calls
`format-integer` or `format-number`.

## What 3.1.0 changes on real published files

`node eval/peppol-next-diff.mjs <files>` runs each Peppol file under both releases.

OpenPeppol's 3.0.22 examples and national examples (master `38d693d`):

```
peppol-bis-invoice-3@38d693d/rules/examples/base-creditnote-correction.xml  [passes 3.0.22, FAILS 3.1.0]
  + PEPPOL-COMMON-R040:fatal
  - -
peppol-bis-invoice-3@38d693d/rules/examples/base-example.xml  [passes 3.0.22, FAILS 3.1.0]
  + PEPPOL-COMMON-R040:fatal
  - -
peppol-bis-invoice-3@38d693d/rules/examples/base-example_profile02.xml  [passes 3.0.22, FAILS 3.1.0]
  + PEPPOL-COMMON-R040:fatal
  - -
peppol-bis-invoice-3@38d693d/rules/examples/base-negative-inv-correction.xml  [passes 3.0.22, FAILS 3.1.0]
  + PEPPOL-COMMON-R040:fatal
  - -
peppol-bis-invoice-3@38d693d/rules/examples/sales-order-example.xml  [passes 3.0.22, FAILS 3.1.0]
  + PEPPOL-COMMON-R040:fatal
  - -
peppol-bis-invoice-3@38d693d/rules/national-examples/GR/GR-base-example-TaxRepresentative.xml
  + PEPPOL-EN16931-R221:fatal
  - -

17 Peppol files; 6 get a different Peppol verdict; 5 pass 3.0.22 with no fatal finding and fail 3.1.0.
  + PEPPOL-COMMON-R040:fatal  5
  + PEPPOL-EN16931-R221:fatal  1
```

The five R040 failures are OpenPeppol's own example files: scheme 0088 with values such
as 9482348239847239874 (19 digits). 3.1.0 makes 0088 GLN-only, and its release note says
the examples were fixed for that reason; the same files at `90f078a`:

```
peppol-bis-invoice-3@90f078a/rules/national-examples/GR/GR-base-example-TaxRepresentative.xml
  + PEPPOL-EN16931-R221:fatal
  - -

13 Peppol files; 1 get a different Peppol verdict; 0 pass 3.0.22 with no fatal finding and fail 3.1.0.
  + PEPPOL-EN16931-R221:fatal  1
```

The Greek tax-representative example's seller has no `cac:PartyLegalEntity`, which the
new inferred-cardinality rule R221 makes fatal (it already fails other rules under
3.0.22, so its verdict does not change).

Unit cases in `peppol-next.test.mjs` (9 with `zatca-cents.test.mjs`): R058 LU VAT
(zero-padded check digits), R040 0088 GLN-only, R054 Dutch KVK warning to error, R043
Belgian 0208 must start with 0 or 1 (a mod-97 failure was already fatal and is not
marked new).

## A page bug found on the way

Checked in a real browser (Playwright, the page served over HTTP): a pasted Peppol file
with a 19-digit 0088 address shows PEPPOL-COMMON-R040 marked "New in Peppol BIS 3.1.0,
rejected from 2027-02-24". The first try showed no official findings at all: the page
named pasted text \`pasted.json\` whatever it held, and \`addOfficialFindings\` skips
\`.json\` names, so **pasted UBL or CII never got the official Schematron**, only dropped
files did. Pasted text that starts with \`<\` is now named \`pasted.xml\`.

## Open

- The branch is the release candidate. When 3.1.0 is tagged on master (expected
  2026-11-23), rebuild `peppol-next-*` from the tag and diff; on 2027-02-24 it becomes
  `peppol-ubl/cii` and `PEPPOL_NEXT` moves to the May 2027 release.
- The Saxon image builds only the current release; the preview is plain-route only.
- No real sender's file has been run through the diff yet: that is the measurement that
  matters (how many of a business's invoices fail in February).
