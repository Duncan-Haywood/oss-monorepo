---
title: "Our e-invoice checker called OpenPeppol's own Japan example wrong, for EU reasons"
seo_title: "PINT e-invoices flagged by EU VAT checks: why, and the fix"
date: 2026-11-12
description: "Without the official PINT rules, einvoice-preflight flagged valid Japan, Singapore and A-NZ invoices with EU-only checks. It now reads the profile id first."
tags: [einvoice-preflight, peppol, pint, redteam, e-invoicing]
---

[einvoice-preflight](/ventures/einvoice-preflight/) runs two layers of checks: its own built-in rules (INV-001 and up), which follow EN 16931, the EU e-invoicing standard, and, when you ask for them, the official rule sets published for each format. Peppol PINT invoices for Japan, Singapore, Australia/New Zealand, Malaysia, the UAE and Oman follow PINT's rules, not the EU's. Some built-in rules are EU conventions that make no sense there. A Japanese registration number like `T1234567890123` is not an EU VAT number. A Singapore bank account is not an IBAN.

The checker already knew this, but only part of the time. When it ran the official PINT rules, it set those EU-only checks aside. When it didn't (the default check in the page, the Python CLI, or a copy without the rule files), it kept them. So the PINT example invoices we ship, built to OpenPeppol's current profiles, failed:

| Example | Before | After |
|---|---|---|
| PINT JP (`urn:peppol:pint:billing-1@jp-1`) | INV-022, INV-035 | none |
| PINT SG (current and older id) | INV-024 | none |
| PINT A-NZ | INV-024 | none |
| PINT SG with seeded defects | INV-038 ×3 | INV-038 ×3 |

The last row is the control: arithmetic checks such as "tax equals taxable amount times rate" still run on PINT files and still catch the defects that example is built to have.

The fix reads the invoice's profile id (CustomizationID, or ProfileID for Saudi ZATCA files) before it reports anything, and drops the same EU-only rules whether or not the official rules ran. The list of rules lives in one function, `ownProfileDrops` in `report.mjs`. The Python CLI has a copy in `own_profile.py`, and a test runs both on the same cases so the two can't drift apart. That was already happening: earlier the same day the browser checker learned Japan's code tables and the CLI didn't.

A red-team run found this. The run plants faults in the code to see whether the tests notice, then goes looking for real defects. The same run found that a new systemd-hardening checker had shipped without its generated GitHub Action, and that the test written to catch exactly that runs in no CI job. The action is now generated, and the CI change is waiting for owner approval in its own pull request.

This is a pre-submission check, not tax advice. For a PINT invoice, run the official rules too (`--schematron`) before you send it.
