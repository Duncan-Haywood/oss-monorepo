---
title: "$1.250: what 58 US-dollar calculators showed a reader in Germany"
seo_title: "toLocaleString() with no locale: US-dollar tools printed $1.250"
date: 2026-11-13
tags: [ventures, quality, testing]
description: "A sweep loaded 1,227 calculators in US English and German. None computed a wrong number, but 58 printed dollar amounts in German format, like $1.250 for $1,250."
---

Open the HSA contribution limit calculator in a browser set to German and, until today, it said the 2026 limit was **$4.400,00**. The estate tax page said the exclusion was $15.000.000. The overtime calculator printed "$1.875,00/hr", and the car lease checker printed "$1,500.00 (6.000 miles over)" on a single line.

Nothing was miscalculated. The numbers were right, only formatted for a German reader on a page that is otherwise in American English and American dollars. But "$1.250" reads as one dollar and a quarter to the people these tax and pricing pages are written for. And where one value used the default and its neighbour did not, as on the lease checker, a single line carried both formats.

The cause is the default argument:

```js
total.toLocaleString()                                   // follows the browser
total.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
```

With no locale, the browser's language decides. Tests and CI run in `en-US`, so they never see it.

## The sweep

A new check, `platform/ci/check_locale_drift.mjs`, finds every venture page with a number input (1,227 of them). It loads each page in headless Chromium twice, once as `en-US` and once as `de-DE`, with the same time zone, a fixed clock and the same seeded `Math.random`. It fills empty number inputs with 1250, presses the Calculate-style button and compares the page text.

It asks two questions:

- **Did a value change?** Every number in the German text is read both ways ("1.250" as 1.25 and as 1250). If neither reading matches the US value in the same place, the page computed something different. That is the dangerous version of this bug: `input.value = x.toLocaleString()` followed later by `parseFloat(input.value)` turns 1.234,5 into 1.234. German short dates (4.3.2026) are matched as day, month and year.
- **Did the format change?** On an English, US-dollar page, any difference is a finding.

The first full pass flagged 2 pages, and both were noise: an elapsed time ("Settled in 5264 ms") and a random route length on the tennis robot page. The check now ignores elapsed times and seeds `Math.random` the same way in both renders.

## What it found

- **Values: none.** No page among the 1,227 computes a different number in German. A static search for `.value = …toLocaleString(` and `parseFloat(…textContent)` agrees: there are no round trips through the locale.
- **Formats: 58 pages** printed numbers in the reader's format. They came from 182 unpinned calls across 84 ventures. The rest of the repository already writes `toLocaleString('en-US'` (755 call sites).

## The fix

In the 74 ventures that are English and US-dollar only, 141 lines in 86 files now pass `'en-US'`, the same as the rest of the repository. After the fix the sweep reports 0 failing pages, and all 74 changed ventures' test suites pass.

Ten ventures were left as they are, on purpose. They offer a currency picker (EUR, GBP, CAD, AUD and others), so a German user who picks euros should see "75,00 €". These are listed in the script as `FOLLOWS_READER`, and only the value check applies to them.

## What it does not catch

The sweep sees one fill and one button press per page. A number in a downloaded CSV or PDF, or one behind a second step, is not checked. Nor is the other direction: a German user who *types* "1,5" into a text field that runs `parseFloat` gets 1. That needs its own sweep, which types locale-formatted input instead of reading output.
