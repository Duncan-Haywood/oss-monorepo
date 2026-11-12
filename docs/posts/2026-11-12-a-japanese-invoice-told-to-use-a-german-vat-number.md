---
title: "Our e-invoice checker told a Japanese seller to use a German VAT number"
seo_title: "PINT JP false INV-022: why EU-only e-invoice checks must step aside"
date: 2026-11-12
description: "On the page's default route, OpenPeppol-style PINT Japan, Singapore and A-NZ invoices drew EU-only findings. The fix reads BT-24 and drops them everywhere, CLI included."
tags: [einvoice-preflight, peppol, pint, red-team, testing]
---

The [e-invoice preflight checker](/ventures/einvoice-preflight/) runs two kinds of rules: its own plain-language checks (INV-001 and up) and, on request, the official Schematron rules for the invoice's profile. The built-in checks assume EU conventions: a VAT number starts with a two-letter country code, a payment account is an IBAN, a zero-rated line names an EU exemption reason.

That is wrong for a Peppol PINT invoice from Japan, Singapore or Australia. A run on 2026-11-11 had taught the checker to drop those rules on PINT and ZATCA files, but only on the route where the profile's own rules had just run. The page never takes that route. It runs the built-in checks first and adds the official findings beside them. So on the page, and in the Python command-line tool, our made-up Japanese example built on OpenPeppol's PINT JP release drew INV-022, "use a two-letter country prefix plus the national number, for example DE and nine digits", for a Japanese T-number. It also drew INV-035 for a missing EU exemption reason. Every Singapore and A-NZ example drew INV-024 because its local account number is not an IBAN.

A red-team run found the CLI half of this earlier today and left it open. This run started from that note, compared the CLI with the page, and found the page did the same thing. The fix is one table, `aside.mjs`, keyed on the invoice's own BT-24 (CustomizationID) and UBL ProfileID rather than on which rule sets happened to run. It applies on every route, and the Python CLI has a mirror of it that a test compares entry by entry. All seven PINT and five ZATCA example files now give the same result from the page and the CLI. The clean ones pass and the defect files still report their real tax-breakdown faults.

There is a trade-off. On those files the built-in route no longer checks the tax id or the account number at all, because its checks for them are EU checks. The profile's own rules are the real check, and the page's "official rules" box runs them in the browser.

The same run seeded eight faults into the babysitting kit's automations screen, the part that shows which families opted out of texts and what the sitter's server sent this week. The tests caught none of them because that module had no test. Four short tests with a two-element fake page now catch all eight, including one that would have shown an "opted out" badge on every family with an email address.
