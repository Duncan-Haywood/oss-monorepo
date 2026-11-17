---
title: "95 failures from the wrong rulebook: our optional validator checked Saudi invoices against EU rules"
seo_title: "PINT and ZATCA e-invoices: false errors from the EN 16931 rules"
date: 2026-11-14
tags: [einvoice-preflight, ventures]
description: "Our self-hosted Saxon route ran EU EN 16931 rules on Singapore, Japanese and Saudi e-invoices: 78 false errors on 10 valid files. It now hands them off."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice against the official validation rules before it is sent. It has two ways to run those rules. The plain route ships with the page: the rules compiled to JSON and run by an MIT XPath engine. The Saxon route is optional: a self-hoster compiles the official stylesheets and runs them in Saxon-JS.

The Saxon build only covers three rule sets: the EU base (EN 16931), Germany's XRechnung and Peppol BIS. Everything added since lives only in the plain route: Peppol PINT for Singapore, Australia and New Zealand, Japan, Malaysia, the UAE and Oman; Saudi Arabia's ZATCA rules; and the national add-ons for Romania, the Netherlands and Portugal.

The server's report already knew that and sent those files to the plain route. Two other doors did not. A self-hosted page with the Saxon build used Saxon for every file once Saxon had loaded, and so did a direct call to the Saxon function. Each fell back to the one rule set it had, the EU base, and ran it on a Singapore or Saudi invoice as if it were an EU one.

## What that looked like

We ran the 19 bundled example files that need one of those rule sets through the EU base alone, then through their own rules (`eval/saxon-plain-handoff.mjs`):

- **95 blocking findings on 13 files.** All 10 valid PINT and ZATCA examples failed, with 2 to 16 errors each (78 in all). PINT writes GST categories (`SR`, `ZR`) that the EU code list rejects; Japanese and Malaysian tax ids are not EU VAT numbers; ZATCA writes timestamps the EU data type does not allow. Under their own rules, none of the 10 has a blocking finding.
- **The real faults went missing.** Each Dutch file with planted defects broke three NLCIUS rules; the EU base found none of them. The Romanian one broke five national rules beside one EU rule; the EU base reported the EU one only.

A seller who saw that report would either "fix" a valid invoice until their tax authority rejected it, or send a broken Dutch one believing it had passed.

## The fix

A small function now names the rule sets a file needs that the Saxon build lacks. When it names any, the Saxon runner hands the file to the plain route. If a copy has no plain rules, the answer is "not checked here", which makes the page ask the server. It never quietly substitutes the EU rules. Five new tests use a fake Saxon that would return an EU error. For the eight example files that need other rules, it is never called.

The general lesson is an old one: a fallback that answers with the wrong standard is worse than no answer. "Unavailable" tells the user to look elsewhere. A confident list of EU errors on a Saudi invoice tells them something false.

Details and the full before/after table are in the venture's [README](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/README.md) and `eval/saxon-plain-handoff-2026-11-14.md`.

*E-invoice preflight checks files against published rules; it is not tax or legal advice, and a pass does not guarantee a tax authority or receiver will accept an invoice.*
