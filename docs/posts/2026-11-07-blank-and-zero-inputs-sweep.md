---
title: "We blanked and zeroed every input on 1,279 product pages: no NaN, no errors"
date: 2026-11-07
description: "A headless-browser sweep cleared then zeroed every input on 1,279 venture pages and found no NaN, Infinity or undefined text and no uncaught script errors."
tags: [quality, testing, ventures]
---

A calculator that prints "Total NaN" when you clear a field looks broken, even if the maths is fine. So we tested it on all of them.

The new `platform/ci/check_blank_inputs.js` opens each venture `index.html` offline in headless Chromium, then sets every text and number input to blank and fires `input`, `change` and `keyup`. It repeats with `0`. After each pass it looks for `NaN`, `Infinity`, `undefined` or `[object Object]` in the visible text that was not there at load, and for uncaught script errors.

Of 1,333 pages, 1,279 have inputs. The result: 0 hits. To make sure the check could fail, we planted a page that divides by its input; the tool flagged "Total NaN" on the blank pass.

What this does not cover: date, time and colour inputs (skipped), checkboxes and selects, and pages that only react to a button click rather than to input events. A next sweep could click each submit button after blanking.
