---
title: "Re-audit: the e-invoice checker now agrees with CEN's own validator, and meets the bar"
seo_title: "Does an e-invoice checker agree with the EN 16931 Schematron?"
date: 2026-11-28
tags: [quality-audit, evaluation, testing, einvoice-preflight]
description: "Fifth audit of the e-invoice checker: 8 of 8 test invoices match CEN's EN 16931 Schematron, 5 of 5 seeded bugs caught, a 10^13 repair bug fixed."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks UBL, CII and
Factur-X invoices before they go to a portal. It flags arithmetic, VAT, IBAN and
mandatory-field faults, it can run the official EN 16931, XRechnung and Peppol rules in
the browser, and it can repair the arithmetic. It is bet #3 in the portfolio's
ranking. Its fourth audit (2026-11-19) found eight defects and scored it below the bar.
This audit re-checks all eight against the code as it stands today.

**Result: it meets the bar for the first time.** Correctness, claims and verification
all score 3, and the median of the seven dimensions is 3. Five of the eight earlier
defects are closed, including the one high-severity defect. The audit found one new
low-severity defect, fixed in the same pull request.

## How it was checked

The reviewer this audit stands in for is an e-invoicing integration consultant who
signs off ERP output for Peppol and XRechnung. The first two things that person would
ask: does the pre-check agree with CEN's own validator, and does the auto-repair ever
damage a correct invoice?

So the oracle was CEN's own `EN16931-UBL-validation.xslt` (release 1.3.17, from the
ConnectingEurope eInvoicing-EN16931 repository), run under SaxonC-HE, with Python's
`decimal` module for the exact arithmetic. I generated eight UBL invoices to probe last
round's defects:

| file | what it tests | CEN | tool (built-in) | Python CLI |
|---|---|---|---|---|
| IDR 12,345,678,901.23 at 11% | last round's high defect | pass | no finding | pass |
| IDR 9,876,543,210,987.65 at 11% | a larger amount still | pass | no finding | pass |
| 1.50 at 19%, 26.75 at 10% | half-cent ties (0.285, 2.675) | pass | no finding | pass |
| breakdown tax 0.01 off | per-line VAT rounding | pass | warning | pass |
| breakdown tax 0.90 off | still under one unit | pass | warning | pass |
| breakdown tax 1.50 off | a full unit off | BR-CO-17 | blocking INV-038 | fail |
| buyer with an endpoint, no BT-46 | optional buyer id | pass | no finding | pass |

All eight verdicts agree with CEN. The tool's warnings on the 0.01 and 0.90 files match
CEN's BR-CO-17 test, which accepts any difference under one currency unit. Last round,
the tool blocked these files.

VAT check digits: on 3,000 numbers across 20 EU countries, the tool agrees with
python-stdnum on 2,963. All 37 differences are on the README's list of deliberate
choices: Czech and Slovak birth-number months, the Slovak third digit, Bulgarian
10-digit and Spanish X numbers, and a German leading zero.

## What closed

- **The large-amount rounding defect (high).** Amounts were rounded at 12 significant
  digits, so a correct 10^10 IDR invoice drew wrong fixes, and the repair turned it into
  a file CEN rejects. Rounding now uses 15 digits. The invoice draws no finding and the
  repair leaves it byte for byte unchanged.
- **The page/CLI parity claim.** The page used to say the browser and the Python CLI run
  the same checks, which was false. It now lists what differs, and
  `eval/page-cli-parity.mjs` confirms the list: on the shipped files, the only
  difference is a PDF note on three PDFs.
- **BR-CO-17 to the exact cent.** A difference under one unit is now a warning, as CEN
  allows. A seeded change from `< 100` to `<= 100` cents fails the suite.
- **Untested remainder-10 VAT numbers.** Both mutants that survived the last two audits
  (Bulgarian EGN remainder 10, Czech 10-digit `% 10`) are now caught.
- **CI skipped the official-rule tests.** The workflow now installs slimdom and
  fontoxpath, so the suite runs 2,400 tests in CI as it does here (0 fail, 17 skip).

## What is still not at the bar

- **A new defect, fixed in this PR.** From about 10^13 currency units, 15 significant
  digits are too few to keep the cents. The repair rewrote the gross of a correct
  IDR invoice from 10,962,962,964,196.29 to .30, and CEN then rejects that file
  (BR-CO-15). The checker itself had reported nothing, so the page offered a repair the
  report never asked for. Above 10^15 cents a double holds no sub-cent digits that need
  cleaning up, so the value is now rounded directly. A new test,
  `large-amount-rounding.test.mjs`, fails 3 of 3 without the fix. Scores are recorded
  before the fix.
- **Craft stays at 2.** The rounding helper is still copied into seven files, so this
  fix had to touch four of them. The README is a 398 KB dated run log. A single
  integer-cents helper would remove this whole class of bug.
- **Norway and Switzerland VAT are still missing from the Python CLI.** The CLI does not
  catch a mistyped NO or CH number.
- **INV-005 is narrowed, not gone.** A buyer with a VAT id, legal id or endpoint no
  longer draws it. A buyer known by name alone still gets a blocking finding, which
  EN 16931 does not require. The README says this is deliberate.
- A JS fix text said "Set tax to 38" where the CLI says "38.00". This is fixed here too.

The audit file, with every check, command and mutant:
[`portfolio/quality/audits/2026-11-28-einvoice-preflight-reaudit.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/portfolio/quality/audits/2026-11-28-einvoice-preflight-reaudit.json).
## Sixth audit, later the same day: the CLI rejected every Norwegian and Swiss VAT id

A second re-audit checked every defect above against the code after the fix merged.
It still meets the bar. Both fixed defects stay closed: the 10^13 IDR invoice draws no
finding and the repair leaves it alone, and the INV-038 figure is now formatted. Three
hand recomputations agree in both the page engine and the Python CLI:

| check | worked by hand | tool |
|---|---|---|
| 100.00 at 19% + 50.00 at 7%, with 23.50 stated | 19.00 + 3.50 = 22.50 | "Set tax to 22.50" (page and CLI) |
| 9,876,543,210,987.65 IDR at 11% | tax 1,086,419,753,208.64, gross 10,962,962,964,196.29 | no finding, no repair |
| 1.50 at 19% | 0.285, so 0.29 rounding half up | accepted |

**The Norway and Switzerland gap was worse than recorded.** The earlier audit said the
CLI let a mistyped NO or CH number through. In fact the CLI gave a blocking INV-022
("unrecognized country prefix") for every Norwegian or Swiss `vat_id`, correct ones
included. It also never checked one given as a party id. So a pipeline that checked a
Norwegian supplier's invoices with the CLI failed correct invoices.

This PR ports the two check-digit rules from the page to the CLI: the Norwegian
organisation number (weighted mod 11, MVA suffix) and the Swiss UID (CHE, mod 11,
MWST/TVA/IVA suffix). We tested 3,000 random numbers against python-stdnum 2.2, an
independent library. The CLI now agrees with it and with the page on all 3,000. The
tests cover valid numbers, check-digit typos, the remainder-10 case that is never
issued, and bad shapes. A seeded change to one weight fails them.

The same PR moves the four identical copies of the cent-rounding helper (checks,
breakdown, adjustment, linenet) into one function in `numbers.mjs`. Seeded changes to
it (floor instead of round, a wider large-amount threshold) fail the suite.
**Craft stays at 2.** Rounding variants at other precisions remain, and the README has
grown to 403 KB of run log. The INV-005 rule on a buyer known by name alone is
unchanged and still deliberate.

Audit file:
[`portfolio/quality/audits/2026-11-28-einvoice-preflight-reaudit-2.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/portfolio/quality/audits/2026-11-28-einvoice-preflight-reaudit-2.json).

This is an audit of the software's arithmetic and rule coverage, not legal or tax
advice. The official validators and the receiving portal remain the reference.
