---
title: "Dutch e-invoices: einvoice-preflight now runs the NLCIUS rules"
date: 2026-10-25
description: "einvoice-preflight checks Dutch NLCIUS (SI-UBL 2.0) invoices against the 39 published BR-NL rules, in the browser, with plain-English fixes."
tags: [einvoice-preflight, netherlands, e-invoicing]
---

Until now [einvoice-preflight](../../ventures/einvoice-preflight/) could say a
Dutch invoice had the Peppol NL-R problems, but not the NLCIUS ones, the Dutch
national format (SI-UBL 2.0) that government buyers and many accounting
packages ask for. The rules were published only as Schematron compiled to
XSLT, inside a Maven Central artefact.

The new `build-nl-rules.mjs` reads that XSLT with the same reader used for the
Romanian and Singapore rules, keeps only the pattern holding the Dutch checks
(39 of 1,022; it refuses to run if base rules are mixed in) and ships them as an
add-on that runs after the EU base. They fire only for a Dutch seller whose
customization ID names NLCIUS.

On a made-up invoice with no seller street, no buyer or order reference and a
payment code of 10, the check reports BR-NL-3, BR-NL-2 and BR-NL-12, each with a
plain-English fix, plus the warning that a country subdivision is ignored on
receipt. The clean example passes with no rule skipped.

Not done: the CII form, the Saxon route, and any real Dutch file or Peppol
access point verdict. The examples are ours.
