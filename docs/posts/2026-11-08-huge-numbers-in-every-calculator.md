---
title: "We typed 1e308 into every calculator input and nothing broke"
date: 2026-11-08
description: "A headless-browser sweep set every text, number and range input on 1,116 venture pages to absurdly large values and found no NaN, Infinity or script errors."
tags: [qa, testing, ventures]
---

Calculators fail in odd places: a blank box, a zero, or a number far too big. Yesterday's sweep covered blank, `0` and `-1`. Today's added `1e308`, `99999999999999999999` and `1e21`, set on every visible text, number and range input, one value at a time.

Across 1,333 venture pages, 1,116 have such inputs. None showed new `NaN`, `Infinity`, `undefined` or `[object Object]` text, and none threw an uncaught script error. Only text absent before the edit counted.

This does not test button clicks, only input events, and pages that compute on a button press stayed untouched. That is the next sweep. The checker is `platform/ci/check_input_edges.js`, now taking `VALS` as a pipe-separated list.
