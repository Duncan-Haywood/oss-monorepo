---
title: "Clicking Every Button With Bad Inputs: 21,600 Clicks, Zero NaN"
seo_title: "Testing 1,300 Calculators With Zero, Negative, Blank and Huge Inputs"
date: 2026-11-08
tags: [testing, quality, calculators]
description: "We filled every input on 1,333 calculator pages with 0, -1, blank and 1e308, then clicked every button. Nothing showed NaN, Infinity or undefined."
---

Earlier sweeps set edge values in the inputs and, separately, clicked buttons with default values. Many calculators only compute when a button is clicked, so the two together are the real test.

The button-click checker now takes a `FILL` value. It sets every text, number and range input to that value, then clicks each button (up to 25 per page) and looks for `NaN`, `Infinity`, `undefined` or `[object Object]` in the visible text, or a page error.

We ran 1,333 pages with `0`, `-1`, blank and `1e308`. That is about 5,400 clicks per value, roughly 21,600 in total, with no hits. The checker covers one click per button and no multi-step flows, so keyboard submits and select, radio and checkbox states are the next gap.
