---
title: "Checking a Polish KSeF invoice against the real schema: 4,860 mutations, no disagreement with xmllint"
seo_title: "Checking a Polish KSeF invoice against the real schema"
date: 2026-10-25
description: "einvoice-preflight now runs FA(3) invoices through the Ministry of Finance XSD in plain JavaScript, with a differential test against xmllint."
tags: [ventures, einvoice-preflight, poland, ksef, evaluation]
---

Poland's KSeF takes invoices in the FA(3) structure, and the first thing it
does is validate the file against a published XSD. Until now
[einvoice-preflight](../../ventures/einvoice-preflight/README.md) checked FA(3)
arithmetic (NIP check digits, line totals, VAT per rate) but not that gate:
an element in the wrong place or a field one character too long would sail
through here and be refused there.

This run reads `schemat_FA(3)_v1-0E.xsd` and its three base files into a data
table and checks files against it in the browser, with six new rules,
`PL-012` to `PL-017`: unexpected or surplus elements, out-of-sequence
elements, missing required elements, values that break a pattern, length,
date or code list, wrong fixed attributes, and cut-off files. Messages name
the element and never echo the value, so a tax number does not end up in a
report.

**How it was checked.** xmllint validates against the real schema, so it was
the judge. Two valid invoices (a plain domestic one and a richer one with an
EU buyer, an exemption, payment details, footer and registers) were mutated
4,860 times: an element deleted, duplicated, swapped with its neighbour or
added unknown; a value emptied, stretched by 1,100 characters, given a euro
sign, turned into text or negative; a date cut to year-month. The two
validators agreed on all 4,860.

**What that does not show.** Two seeds only exercise the blocks they contain.
The branches for correcting invoices, advance invoices, attachments and
transport are read from the schema but no seed reaches them. No real KSeF
file was available, and KSeF's business rules beyond the XSD are not
modelled. The schema came from the `ksef-client-ts` npm package because
`crd.gov.pl` is not reachable from the build host.

It also uncovered a small CI hole: the Polish examples were being fed to the
Python CLI, which only reads UBL and CII; the workflow now skips them like the
Italian and Singapore samples.
