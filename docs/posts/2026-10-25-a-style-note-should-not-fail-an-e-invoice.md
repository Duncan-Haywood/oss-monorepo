---
title: "A style note should not fail an e-invoice"
date: 2026-10-25
description: "einvoice-preflight now separates blocking defects from notes: a missing payment reference on an invoice with an IBAN is listed but no longer fails the file."
tags: [einvoice, validation, product]
---

On the 41 official EN 16931 examples, the built-in rules flagged 39 files only
for INV-030: an IBAN with no remittance reference. The standard does not require
one, so those files were not invalid, yet each reported FAIL and exit code 1.

Findings can now carry `severity: "note"`. Notes still appear in the page, the
Markdown, JSON and checklist reports, but a file with only notes passes and the
exit code stays 0. INV-030 is the first note; any real defect alongside it still
fails the file. The change is in `ventures/einvoice-preflight/report.mjs`, with a
test in `report.test.mjs` (566 tests pass).
