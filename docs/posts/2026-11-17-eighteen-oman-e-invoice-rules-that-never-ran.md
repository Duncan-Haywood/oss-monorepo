---
title: "Eighteen Oman e-invoice rules that never ran, and the variable name behind it"
date: 2026-11-17
seo_title: "Eighteen Oman e-invoice rules that never ran"
tags: [einvoice-preflight, ventures]
description: "A cross-check against Saxon found that 18 of Oman's PINT rules were skipped on every file because one variable name collided. All of them run now."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice against the official rules before it goes to a Peppol access point or a tax authority. Most of the official rules come as Schematron compiled to XSLT. Big validators run that XSLT on Saxon. Our page runs it in the browser instead: a compiler turns each stylesheet into XPath for [fontoxpath](https://github.com/FontoXML/fontoxpath), so the invoice never leaves your machine.

That makes Saxon the reference to test against. Earlier today we checked the EU rule sets that way. This run did the same for PINT (Peppol's international format, used in Singapore, Australia and New Zealand, Japan, Malaysia, the UAE and Oman) and for Saudi Arabia's ZATCA rules. The method: take each publisher's own example invoices (182 files), put a no-break space into one field at a time (2,268 copies), and compare our findings with SaxonC-HE running the official XSLT.

## What turned up

Most differences were the expected whitespace ones, and the morning's fix already handled them. Seventy-six were something else. They were all Oman, and our side was always the one missing a rule.

The cause was a name. Oman's rules define a global variable `$lines` (every invoice line) and a helper function `u:vatBase($cat, $lines, $allow, $charge)` that takes its own `$lines` parameter. To make the stylesheet self-contained, our compiler pastes global variables into function bodies. It pasted this one over the parameter too, which turned the function signature into nonsense. The whole block of helper functions then failed to parse. Every rule that needed a helper threw an error, and the page listed those rules as "not checked".

That came to 18 rules, skipped on every Oman file since the set shipped:

- **IBR-071-OM**: the line net amount must equal quantity times price, plus line charges, minus line allowances.
- **ALIGNED-IBRP-S-08/09-OM** and the E, O and Z versions: the VAT breakdown's taxable amount and tax must add up from the lines.
- The allowance percentage check, the tax-currency total and a few more.

These are the arithmetic checks, the ones most likely to catch a real billing system bug. The page did say "not checked" next to each rule, but an "all clear" with a footnote is easy to misread.

## The fix

- Function parameters now shadow global variables of the same name, as they do in XSLT. All 33 rule sets that carry helper functions now parse, and a test keeps it that way.
- Oman's "issue date is not in the future, by Oman time" rule needs `adjust-date-to-timezone`, which fontoxpath doesn't have. The compiler now swaps in an XQuery copy of the standard function. It reproduces the examples from the W3C spec.
- One rule uses XSLT's `current()`, which plain XPath doesn't have. Inside a Schematron assertion it means "the node this rule is checking", so the compiler binds it to exactly that.
- A time of day with a no-break space (ZATCA's `IssueTime`) is now reported at the field, as amounts and dates already were.

## After

With the rules as shipped this morning, our rule ids differed from Saxon's on 80 copies. Now they differ on 4. All 4 are a labelling quirk: PINT Singapore's rule `BR-NG-08-GST-SG` writes `[BR-NG-08]` in its message, and we read the id from the message. On the 182 unmodified examples, our findings match Saxon's except for one deliberate gap: Oman's "rule set version" banner, which fires on every file and isn't a check.

A made-up Oman invoice now runs all 154 of Oman's jurisdiction checks, with none skipped. If you send PINT invoices in Oman, the line and VAT-total arithmetic is now checked before your access point checks it.

Everything here is synthetic. We had no real Oman invoice with a real defect to test on. The full method, counts and scripts are in [`eval/pint-zatca-whitespace-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/pint-zatca-whitespace-2026-11-17.md).

*This is a validation aid, not tax or legal advice. The receiving access point and the tax authority's own validator decide.*
