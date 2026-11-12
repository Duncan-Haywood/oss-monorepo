---
title: "The browser learned Japan's invoices this morning. The Python CLI didn't"
seo_title: "Keeping a JS and Python e-invoice checker in step: a parity test"
date: 2026-11-12
tags: [einvoice-preflight, redteam]
description: "E-invoice preflight's Python CLI still called PINT Japan and Oman addresses unknown after the browser was fixed. A parity test now catches the next one."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) has two copies of its built-in checks: the JavaScript that runs in the browser and the Node CLI, and a Python package (`python3 -m einvoice_preflight`) for people who would rather pip-install it. Several source files say so at the top: "Mirrors src/einvoice_preflight/linenet.py."

This morning's change taught the browser the Peppol PINT profiles for Japan, Malaysia, the UAE and Oman. Three of its fixes were to shared code tables:

- **19 more electronic-address schemes** (EAS codes), among them 0188, the Japanese corporate number, and 0248, Oman's;
- **document type code 480**, which PINT adds and Japan and the UAE use;
- **a missing VAT percentage reads as 0** on categories E, Z, AE, K and G, as it already did on O, because the UAE's and Oman's invoices leave it out there.

All three landed in the `.mjs` files. None reached the Python files.

## What that looked like

On OpenPeppol's own Japanese example (`examples/pint-current-jp-invoice.xml`), the Python CLI before and after today's fix:

| | before | after |
|---|---|---|
| INV-039, supplier address scheme unknown | yes | no |
| INV-039, customer address scheme unknown | yes | no |
| INV-022, tax id not an EU VAT number | yes | yes |
| INV-035, 0% line without exemption reason | yes | yes |

A JSON draft with `"document_code": 480` got INV-032 ("not a known code") from Python and nothing from the browser. A zero-rated line with no percentage was left out of Python's per-rate totals.

The two that remain are not today's drift. The browser drops INV-022 and INV-035 when PINT's official rules govern a file, because those checks assume EU conventions. The Python CLI never reads `CustomizationID`, so it cannot tell. That is written down in the red-team record as an open defect, with the fix it needs.

## Why the tests didn't see it

Each language has its own suite, and each suite passed: the Node tests tested the Node code, the Python tests tested the Python code, and no test compared them. The comment "Mirrors ..." was the only link, and comments don't fail.

## The guard

`tests/test_js_parity.py` reads three tables straight out of the `.mjs` source (`KNOWN_SCHEMES` in `endpoint.mjs`, `TYPES` in `document.mjs`, `NO_RATE_CATEGORIES` in `linenet.mjs`) and checks the Python mirror agrees, in both directions. Before the fix it failed on 480, on E, Z, AE, K and G, and on the 19 codes. It runs in the venture's existing CI job with the other 383 Python tests, in well under a second.

It covers tables, not logic. A rule rewritten in one language and not the other still gets through. But tables are where today's drift happened, and they are the cheapest thing to compare.

*E-invoice preflight checks a file's shape against published rules. It is not tax or legal advice, and a pass does not mean a network or tax authority will accept the invoice.*
