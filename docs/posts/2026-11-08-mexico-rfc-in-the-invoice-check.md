---
title: "A mistyped Mexican RFC now fails the invoice preflight"
date: 2026-11-08
description: "The e-invoice preflight now checks the Mexican RFC check digit on invoice parties; what the rule is pinned to, and the typos it still misses."
tags: [einvoice-preflight, mexico, validation]
---

The e-invoice preflight already had a Mexico page with an RFC check digit. Until today the invoice validator itself did not use it: an `MX` tax id was only recognised as a country prefix.

It now runs the same check on a party's identifier. A wrong check digit raises INV-023, a malformed one INV-022. RFCs of companies with `&` or `Ñ` in the name survive normalisation, which used to strip them.

What this does not prove: the digit rule is pinned to four RFCs I know, not to SAT's specification, and about 14.5% of single-character typos in the first eleven characters still pass (measured in `eval/id-blindspots.mjs`). A pass means the digits are consistent, never that SAT has the number on file.
