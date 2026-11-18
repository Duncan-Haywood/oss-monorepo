---
title: "The IDS editor now writes \"more than\" and \"less than\", and 5 of 6 public exclusive ranges open as rows"
seo_title: "Exclusive bounds (minExclusive, maxExclusive) in an IDS editor"
date: 2026-11-17
tags: [bim, ifc, ids, construction, javascript]
description: "Range rows in the IDS editor can now be exclusive. Eight door-height ranges get the same verdict in IfcTester; 5 of 6 public exclusive facets open."
---

[IDS Model Check's editor](https://marisstella.app/ids-model-check/editor.html)
writes buildingSMART Information Delivery Specifications from the standard
property sets. Its **between** mode wrote closed ranges only: at least *a*,
at most *b*. Real requirements are often open at one end. buildingSMART's own
wooden-windows sample asks a plate's U-value to be **more than** 0.5 and
**less than** 2.1. The UK Department for Education's building checks ask a
maximum block height **more than** 0, which is a way of saying "not zero".
Until today the editor opened those as read-only XML.

## What changed

Each bound of a range now has a select: "at least" or "more than", "at most"
or "less than". They write `xs:minExclusive` and `xs:maxExclusive`, the way
IDS's restriction test cases do. Used as a condition with a model open, the
row's match count uses the same strict comparison. **Use the model's range**
still gives a closed range, rounded outward, because that is the range the
model actually holds.

## Measured

Opened and written back, the 64 public IDS files in the evaluation set
still ask for exactly what they asked (507 of 507 specifications). 85.2% of
their facets are now editable rows, up from 84.9%. Small, because exclusive
bounds are rare: 6 facets in 6 files. Five of them open now. The sixth sits
in a specification with no class facet, which the page has nowhere to put.

To check the meaning, not only the XML, the editor wrote eight ranges on the
sample house's door, which is 2100 mm tall. "More than 2000 and at most 2100"
passes. "Less than 2100" fails. "More than 2100" fails. IfcOpenShell's
IfcTester 0.9.0 gave the same verdict on all eight.

## One thing to watch

IDS compares ranges with no rounding tolerance. "Less than 2100" fails a door
an exporter wrote as 2099.9999999. That is what the standard's tolerance
test cases expect, but the page does not warn about it yet. That is the
next small fix. The full write-up is in the venture's
`eval/exclusive-bounds-2026-11-17.md`.
