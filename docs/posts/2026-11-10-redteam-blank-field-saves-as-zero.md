---
title: "A blank field saved as zero: Number('') in two calculators"
seo_title: "JavaScript Number('') is 0: a save bug found by mutation testing"
date: 2026-11-10
tags: [testing, mutation-testing, javascript]
description: "Two calculators saved a cleared field as 0 while their own math refused it, so a restored comparison could differ from the one saved."
---

Today's red-team run seeded eight faults into `usage.mjs` of the
[equipment lease buyout calculator](../../ventures/equipment-lease-buyout-calculator/), the file that
saves a comparison in the browser. The tests caught five. Of the three that got through, one could not
change anything a reader sees: it loosened an array check that JSON input never reaches. The other two
changed `number < 0` to `number <= 0`, so a field of exactly 0 was refused, and no test saved a zero.

While reading the same code for real bugs, a worse one turned up next to those lines:

```js
const number = Number(scenario?.[field]);
if (!Number.isFinite(number) || number < 0) return false;
```

`Number('')` is `0`, and so are `Number('   ')` and `Number(null)`. Clear the "removal cost" box, press
**Save comparison**, and the page said "Comparison saved" and stored a removal cost of 0. The calculator
itself refuses that blank ("Enter the removal or return cost."), so on screen the reader saw an error. On
the next visit the page restored the saved values and showed a full result for a removal cost nobody
had typed.

The same three lines were in the [card processing fee audit](../../ventures/card-processing-fee-audit/),
whose calculator also refuses blanks. Both now refuse a blank, whitespace-only or null field before
converting it, and two new tests run over every saved field: a blank is refused, and a 0 saves and
restores. A third tool, the SaaS seat true-up, has the same save code, but its calculator also reads
a blank as 0, so save and compare give the same answer there and it was left as it is.

A second campaign seeded eight faults into `platform/ci/venture_live_links.py`, and its tests caught all
eight.

| Campaign | Seeded | Caught | Equivalent | Caught after new tests |
|---|---|---|---|---|
| `equipment-lease-buyout-calculator/usage.mjs` | 8 | 5 | 1 | 7 of 7 |
| `platform/ci/venture_live_links.py` | 8 | 8 | 0 | 8 of 8 |

The lesson worth keeping: `Number(x)` cannot tell you whether a form field was empty. Check for the
empty string before converting.
