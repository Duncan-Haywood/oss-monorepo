---
title: "Type 1,200 instead of 1200 and 42 of our calculators changed their answer without a word"
seo_title: "Thousands separators in web calculators: a sweep of 335 pages"
date: 2026-11-15
tags: [web, javascript, forms, input-validation, testing, playwright, open-source]
description: "We typed 1200 and 1,200 into every decimal text field on 335 of our pages. 111 fields read them differently, 75 of them silently. 22 tools are fixed."
---

Most of the calculators in this repository use plain text boxes for numbers, marked `inputmode="decimal"` so a phone shows the number pad. A text box, unlike `<input type="number">`, lets you type a comma. People type commas in big numbers. So we asked one question of every such box: does the page read `1,200` the same way it reads `1200`?

## How we checked

A new script, `platform/ci/check_thousands_input.mjs`, opens each page in headless Chromium, loads the page's own example data, types `1200` into one field, presses the page's calculate button and keeps the visible text. Then it reloads and does the same with `1,200`, and compares the two texts with every comma removed. Two guards keep it honest: it types `1200` twice first and skips pages whose text changes by itself (random draws, clocks), and it skips fields where a blank box and `1200` give the same page, because those prove nothing.

## What it found

335 pages, 509 fields that visibly affect the result. **111 fields read `1,200` differently from `1200`.** In 36 the page said so ("must be a number"). In 75, across 42 tools, it just gave another answer. Some examples straight from the sweep log:

| tool and field | with `1200` | with `1,200` |
|---|---|---|
| mid-term rental calculator, fixed monthly costs | short-term rental nets $984 a month after fixed costs | short-term rental nets $2183 a month after fixed costs |
| trial conversion timing, monthly price | $110769 | $NaN |
| bid win-rate optimizer, your cost on the next job | quote on a $1200.00 job | quote on a $14400.00 job |
| H-1B lottery odds, Level I registrations | 2.81 expected selections | 2.82 expected selections |

The cause is two lines of JavaScript. `Number("1,200")` is `NaN`, and many pages then quietly treat the field as empty and use a default. `parseFloat("1,200")` is `1`, because it stops at the comma. The H-1B page is the second kind: it read 1,200 registrations as one.

## The fix, and its limit

Each fixed page now passes the field through a small helper that removes commas only when the text is a properly grouped number (`1,200`, `12,345.67`). Anything else is left alone, so `1,5`, which in much of Europe means one and a half, still fails loudly instead of becoming fifteen. Guessing which convention a reader uses is worse than asking.

This PR fixes 22 tools: the 18 silent ones where values over a thousand are normal (rents, job costs, registrations, prices) and four whose dollar fields refused the comma outright (yearly retirement spending, a monthly retainer, the cost of an e-bike, the cost of running a class). Each re-sweep reads both forms the same and each tool's own tests still pass.

The rest are listed in [the run's report](../reports/2026-11-15-thousands-separator-sweep.md). Most are percent, day-count or seed fields where nobody types a four-digit number, which is why they come second. The sweep also cannot see the 199 fields whose effect never shows on the page without a pasted file, so those are unchecked, not clean.

If you run a calculator on the web: try typing a comma into your own number boxes. It takes ten seconds.
