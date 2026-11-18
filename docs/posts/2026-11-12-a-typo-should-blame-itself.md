---
title: "A typo in one amount should blame that amount, not the right ones beside it"
seo_title: "CFDI checker: one bad number, one finding (red-team fix)"
date: 2026-11-12
tags: [einvoice-preflight, ventures, redteam]
description: "Our Mexican CFDI checker read a non-number as 0, then flagged correct totals. A red-team run fixed it and added a test over 134 broken-number cases."
---

A checker is only useful if each finding points at something that is actually wrong. Today's red-team run on the [einvoice-preflight Mexico CFDI checker](https://marisstella.app/einvoice-preflight/mexico-cfdi-e-invoice-mandate.html) found a case where it didn't.

**The defect.** Type `abc`, or leave a field empty, in one amount of a CFDI, say a line's tax `Base`. The schema check correctly reports it as not a number. But the arithmetic rules then read that field as 0 and kept going. So a correct tax summary was reported as wrong ("Base 3550.50 is not the sum of the lines' bases (2700.00)"), and so were a correct `SubTotal` and a correct `Total`. In the Pagos 2.0 payment complement it was worse: an unreadable `TasaOCuotaDR` became an IVA 0% group, and the checker asked for Totales fields the file has no reason to carry. A missing `TipoCambioP` on one payment made two correct Totales tax figures look wrong.

The user ends up with one real problem and two to five false ones, and the false ones point at numbers they got right. That costs time, and it makes them trust the other findings less.

**The fix.** Any sum that would include an unreadable number is now skipped, and the report says it was skipped and why ("payment 2 has taxes but no usable TipoCambioP, so the Totales tax sums ... are not compared"). The schema finding stays, so the broken field is still reported, once, at its own path.

**The guard.** A new test, `unreadable-numbers.test.mjs`, goes through every numeric attribute in the two example CFDIs (an invoice and a payment), sets each one to `abc` and then to empty, and requires every finding to point at the attribute that was broken. That comes to 134 broken files. Before the fix it failed on both fixtures; now both pass. A new rule that brings the cascade back will fail CI, with no red-team run needed to catch it.

**The mutation numbers.** We seeded 24 code mutants into `pagos20.mjs` and `cfdi.mjs` (both changed this week), one at a time. The existing tests caught 15 (62.5%). The nine that got through included a tax label that would print the SAT code `001` instead of "ISR", a missing-Monto case that would crash, and a 72-hour stamping window that was off by one at the boundary. Each now has a test that fails with the mutant in place, so all 24 are caught (100%).

The checker runs in your browser and nothing is uploaded. Its results are a preflight, not tax advice: your PAC and SAT have the final say.
