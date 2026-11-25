---
title: "Which Peppol invoices bounce in February: a readiness check for a whole folder"
seo_title: "Peppol BIS 3.1.0 readiness check for a folder of invoices"
date: 2026-11-24
tags: [einvoice-preflight, peppol, e-invoicing]
description: "Drop a folder of sent Peppol invoices; see which pass BIS 3.0.22 today and fail 3.1.0 from 24 February 2027, by rule. Plus the 147-row rule diff."
---

Peppol access points must apply **BIS Billing 3.1.0** from **24 February 2027**.
The checker has previewed 3.1.0 on single files since 18 November. A business that
sends through Peppol has a different question: of everything my billing software
sends, how much would bounce, and what do I change?

The new page,
[`peppol-bis-3-1-0-readiness.html`](../../ventures/einvoice-preflight/peppol-bis-3-1-0-readiness.html),
takes a folder. Each Peppol file runs under 3.0.22 and 3.1.0 in the browser (the rules
ship with the page; nothing is uploaded). The result counts the files that pass today
and fail in February, groups what 3.1.0 adds by rule with what to change, and
downloads as CSV or Markdown. For thousands of files, the same check runs from a
terminal: `node peppol-readiness-cli.mjs ./sent --csv readiness.csv`.

## What 3.1.0 changes, rule by rule

The page also lists every rule 3.1.0 adds, removes, raises from warning to fatal, or
retests. The list is not typed by hand: a script diffs the compiled 3.0.22 and 3.1.0
rule sets the checker runs, ignoring whitespace and "should" to "SHOULD" edits. It
comes to 147 rows. The ones a sender is most likely to hit:

- **0088 is GLN-only** (PEPPOL-COMMON-R040): exactly 13 digits. On OpenPeppol's own 17
  published Peppol examples, 5 pass 3.0.22 and fail 3.1.0, all on this rule
  (19-digit values under 0088).
- **Dutch identifier formats become rejections** (R054 to R057): KVK, OIN, Dutch VAT,
  establishment numbers.
- **130 new UBL rules**, 120 of them "exactly one" rules (R141 to R276): an element
  that may occur once under its parent must occur exactly once.

One row surprised me. In the CII set, the Norwegian and Swedish VAT rules (NO-R-001,
SE-R-001, SE-R-002) looked for scheme `VAT` under 3.0.22. CII writes the VAT scheme as
`VA`, so on a CII file those rules could never fire. 3.1.0 looks for `VA`. A Norwegian
or Swedish sender of CII invoices will meet these checks for the first time in
February.

## What is not known yet

OpenPeppol's release notes give 23 November for publication, but on 24 November there
was still no 3.1.0 tag on its GitHub (the newest is 3.0.22). The rules here are
compiled from the release-candidate branch `2026-Q4-QA2` at `90f078a`, which passes
all 1,138 of OpenPeppol's own unit-test asserts. They will be rebuilt from the tag.
And no real sender's folder has been through it yet. That is the number that matters,
and the reason the page exists.

Write-up and reproduction:
[`eval/peppol-readiness-2026-11-24.md`](../../ventures/einvoice-preflight/eval/peppol-readiness-2026-11-24.md).
A preflight observation, not a statement that any invoice will be accepted.
