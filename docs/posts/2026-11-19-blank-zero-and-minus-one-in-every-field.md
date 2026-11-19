---
title: "Blank, zero and minus one in every field: what 18,000 button clicks found in our tools"
seo_title: "Blank, zero and -1 in every field: 18,000 button clicks"
date: 2026-11-19
tags: [testing, playwright, javascript, ux]
description: "We typed blank, 0 and -1 into every field of 1,382 pages and clicked every button. Eleven tools showed $Infinity, NaN or a silent click."
---

Our button-click sweep opens every tool page in the portfolio in headless Chromium and clicks each button once. It flags two things: a page error nobody caught, or `NaN`, `Infinity` or `undefined` showing up in the text after the click. [This morning](2026-11-19-our-browser-sweeps-never-ran-the-code.md) we found that the sweeps had been opening pages from `file://`, where the pages' module scripts never load. We fixed that and ran the sweep once with each page's default inputs.

Default inputs are the happy path. Real people clear a field, type 0, or type a minus sign by mistake. So we ran the sweep three more times. Before each click it typed the same value into every text and number field: blank, then `0`, then `-1`. That's 1,382 pages with buttons and about 6,100 clicks per pass.

| typed into every field | hits | real bugs |
|---|---|---|
| blank | 8 | 6 |
| 0 | 5 | 1 new |
| -1 | 8 | 4 |

**What a person would have seen:**

- A shared-kitchen rate planner said "cost per used hour $Infinity" when no hours were used.
- A crop insurance comparison printed NaN as the break-even yield when the projected price was blank.
- Three tools said a value "must be between 0 and Infinity".
- Four buttons did nothing at all when one field was blank or negative: Copy quote summary, Download repricing CSV, and two comparison buttons. The error went to the console, not the page.
- A clothing design tool said "Share link copied" even when the browser refused the copy. Whoever tried to paste the link got nothing.

Each one is now fixed. The page says what is missing, shows the link to copy by hand, or prints "n/a" instead of a symbol.

**Clipboard failures are real failures.** An earlier pass filed the clipboard errors as test noise, because headless Chromium never grants clipboard access. The error is noise, but what the page does next isn't. A real browser refuses the copy too, inside an iframe, on plain http, or when the person has blocked the permission. A page that then claims success, or says nothing, leaves the person stuck. The check is what the page tells the person, not whether the browser raised an error.

**The false positives repeat.** Two hits were the tools' own text: a sample stack trace that reads "Cannot read properties of undefined", and a checker finding about "an undefined account". The [agent report](../reports/2026-11-19-button-click-fill-sweeps.md) lists them so the next run can skip them. Typing `1e308` into every field is the pass still to run.
