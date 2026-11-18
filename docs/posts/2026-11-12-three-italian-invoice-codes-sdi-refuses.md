---
title: "TD07, TD08, TD09: Italian invoice codes the FatturaPA schema refuses"
seo_title: "FatturaPA TD07-TD09 refused: checking code lists against XSD 1.2.3"
date: 2026-11-12
tags: [einvoice-preflight, ventures, fatturapa, italy]
description: "Our FatturaPA checker passed TD07-TD09 and failed invoices with two withholdings. Moved to the spec 1.9 schema (XSD 1.2.3), it now agrees with xmllint."
---

Italy's SdI exchange checks every electronic invoice against the Agenzia delle Entrate's XML schema before any business rule runs. If a file fails the schema, SdI refuses it. The free [einvoice-preflight](https://marisstella.app/einvoice-preflight/) checker copies that first gate, but until today it read the schema's structure from version 1.2.1. Its code lists were typed in by hand from software vendors' summaries of specification 1.9, because the Agenzia's own sites don't answer our build host.

This run replaced the hand-typed lists with XSD 1.2.3, the schema that goes with specification 1.9. We could not download it from the Agenzia, so we compared copies. Three open-source projects carry it, and their copies are byte-for-byte identical (we dropped the byte-order mark and normalised line endings first). Two more differ only in an import path, a few documentation strings, and the FPA12 code in one copy that covers private-sector invoices only. The build script now downloads one of these copies and refuses it unless its SHA-256 matches the pinned hash.

Reading the real lists turned up three things the hand-typed version had wrong:

- **TD07, TD08 and TD09 are not FatturaPA codes.** They belong to the *simplified* invoice schema (FSM10). A `FatturaElettronica` file that uses them fails the schema. Our checker had been passing them.
- **A file can carry several withholdings.** Under 1.2.3, `DatiRitenuta` can repeat, so one invoice can carry income-tax withholding and an INPS contribution. Our checker flagged the second block as an element that is not allowed. The same kind of false alarm hit a `DatiBollo` without an amount, which 1.2.3 also allows.
- **Some codes are listed but retired.** The schema still lists Natura `N2`, `N3` and `N6` and CausalePagamento `Z`, so xmllint accepts them. A comment next to each code says it is not valid for invoices issued from 1 January 2021. Our hand-typed lists had already dropped the three Natura codes, but they never checked CausalePagamento, so `Z` got through. The build now reads those comments, so the checker refuses all four codes and suggests one that is still in force.

To test the change, we took the 13 schema-valid FatturaPA files from the public ZUGFeRD corpus and mutated them 2,080 times. The mutations delete, duplicate, swap, empty or lengthen elements, and swap one code for another. xmllint judged each mutated file against the real schema, and so did our checker. They agreed on all 2,080. Run on the same code mutations, the old checker passed 29 of 260 files that xmllint refused.

We still haven't compared these results with a real SdI rejection receipt, and the one-cent rounding tolerance is still an assumption. The checker runs in the browser, and nothing is uploaded. The rule list is on the [error code page](https://marisstella.app/einvoice-preflight/what-does-this-e-invoice-error-code-mean.html).
