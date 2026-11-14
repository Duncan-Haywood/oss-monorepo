---
title: "11.999999999999998 Listings: A Browser Sweep for Unrounded Floats"
seo_title: "Finding 0.30000000000000004 on Calculator Pages With Playwright"
date: 2026-11-14
tags: [quality, testing, javascript]
description: "A new sweep loads 3,862 venture pages, nudges their inputs and looks for float noise. Four pages printed it; a fifth had the same bug waiting."
---

Every calculator in this repository has been through sweeps that look for `NaN`, `Infinity`, `undefined` and `[object Object]` in the rendered page. None of them can see this line, which the Etsy profit calculator printed when the Plus inputs were edited:

> Plus breaks even at 11.999999999999998 listings this month

The number is finite and numeric, so it passes every check that asks "is this a number?". It is also obviously wrong to the person reading it: you cannot list 0.999999999999998 of an item, and a page that prints it looks broken whatever the arithmetic underneath.

## The sweep

`platform/ci/check_float_noise.mjs` loads each venture HTML page in headless Chromium, offline, and reads the visible text plus every `<output>` and read-only field four times:

1. on load;
2. after re-firing `input` and `change` on every field, for pages that compute on input;
3. after clicking up to four buttons whose label looks like "Calculate", "Compare" or "Estimate";
4. after **nudging** every filled number field to an awkward decimal (12 becomes 12.1, 0.5 becomes 0.7) and clicking again.

A hit is a run of six or more `0`s or `9`s after the decimal point, ended by another digit, with at least nine decimal places in all: the signature of binary floating-point error rather than a precision anyone chose. `1.0000001` and `3.14159265` pass; `0.30000000000000004` and `2.8000000000000003` do not. The matcher has its own unit tests (`platform/ci/test_check_float_noise.mjs`).

## What it found

Over all 3,862 pages, the first three passes found one page; the nudge pass found three more.

| Page | What it printed | Cause | Fix |
|---|---|---|---|
| grape-grower sell vs bottle | yield ladder row "2.8000000000000003" tons/acre, at the default inputs | the row label was rounded, then overwritten | label set after the spread |
| Etsy profit calculator | "breaks even at 11.999999999999998 listings" | `remaining / fee` returned raw | a whole count: `Math.ceil(x - 1e-9)` |
| wedding florist proposal | "(14.100000000000001 crew-hours)" | `(4.7) × 3` printed as is | hours rounded to two places for display |
| pension lump sum vs annuity | grid row "3.0999999999999996%" for a typed 5.1% return | `rate - 2` used as the label | grid rates rounded to six places |

The first one is the interesting one, because the code tried to round. The yield ladder built each row like this:

```js
({ tonsPerAcre: Math.round(o.tonsPerAcre * k * 100) / 100, ...row(o, { tonsPerAcre: o.tonsPerAcre * k }) })
```

and `row()` returns `{ ...ov, wine, fruit, gain }`, so the unrounded `3.5 × 0.8` it was handed is spread back over the rounded label one key later. Object spread is last-write-wins. The same line shape, with the same helper habit, was in the junk-car buyer offer calculator's scrap, converter and weight ladders. Its default inputs happen to multiply out to whole numbers, so the page looked fine, but type a car weight of 3,333 lb and the ladder's first row read "1,999.8 lb" against a label meant to be whole. That one was found by grepping for the pattern, not by the sweep, and fixed the same way.

The Etsy fix changes an answer, not just its spelling. Break-even listings was a fraction (12.5 listings at some inputs); it is now the first whole number of listings that covers the Plus fee, 13 in that case, which is the question a seller is asking.

The four fixes in `calc.mjs` each carry a regression test in that venture's suite; the florist fix is a display formatter in the page itself, and the sweep is its test.

## Why the earlier sweeps missed it

They test for values that are not numbers. Float noise is a number that is not *rounded*, and at a product's default inputs most products' arithmetic lands on clean values: 3.5 tons × 1.2 is 4.2 in floating point, 3.5 × 0.8 is not. Three of the four hits only appeared once the inputs were awkward, which is what a person types and what a test fixture rarely does. That is the general lesson the nudge pass encodes: defaults are a single, lucky point.

## Running it

```
node platform/ci/check_float_noise.mjs [out.json] [--limit N] [--only <path substring>]
```

It took 175 seconds for every venture page on a cloud container and exits 1 on any hit. After these fixes it reports 0 of 3,862.
