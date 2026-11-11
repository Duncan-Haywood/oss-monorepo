---
title: "Calling getComputedStyle on every element cost us 100 ms on a phone"
seo_title: "getComputedStyle on every element: a 100 ms cost and the fix"
date: 2026-11-11
tags: [performance, accessibility, polish, javascript, lighthouse]
description: "A shared script asked every element for its overflow to find scroll boxes: 100 ms on a 4,204-element page. Reading the stylesheet rules first cut it to 8."
---

Every page on this site loads one small shared script. One of its jobs is
accessibility. A box with `overflow-x:auto`, such as a wide table of figures in a
narrow card, scrolls with a mouse or a finger but not with a keyboard, unless
the box can take focus. So the script finds each box that really scrolls and
gives it `tabindex="0"` (WCAG 2.1.1; axe calls the check
`scrollable-region-focusable`).

To find those boxes, it called `getComputedStyle(el).overflowX` on every
element in the page.

On our biggest calculator, the [wall framing takeoff](../../ventures/wall-framing-takeoff/),
"every element" is 4,204 elements. Under Lighthouse with real 4x CPU throttling,
the script's longest task was about 250 ms. Timing it inside the page showed
where the time went. The first sweep over all elements took about 98 ms, and an
identical second sweep straight after took 15 ms. The values were not the
expensive part. Chrome builds a computed-style object for each element the first
time anything asks for one, and we asked for 4,204.

**The fix: ask the stylesheets first.** Only a CSS rule or a `style` attribute
can give an element `overflow-x:auto` or `scroll`. The script now reads the
page's rules (185 on that page) and keeps the selectors that set it (7). It runs
one `querySelectorAll` and checks the 40 elements it finds. Rules inside
media queries count whether or not they match, so the set is never too small,
and the final check is the same as before. If a stylesheet's rules can't be read
(a cross-origin sheet other than Google Fonts'), it falls back to the old sweep.
The browser's own stylesheet is the one thing it doesn't see. That only makes
`<textarea>` scroll, and a textarea takes focus anyway.

**Then: measure after the paint.** The width check reads `scrollWidth`. If you
read it inside the event, right after a calculator rewrote its result panel,
the browser has to lay out the page on the spot. The check now runs just after
the next frame, when layout is already done. A tab stop that shows up one frame
later makes no difference to a keyboard user.

**Results**, three Lighthouse runs each, mobile, devtools throttling:

| wall framing takeoff | before | after |
|---|---|---|
| longest task from the shared script | 251 ms | 123 ms |
| total blocking time (avg) | 647 ms | 577 ms |

The bookkeeper's total blocking time went from 132 to 111 ms. Single-run TBT
moves about 50 ms either way, so the task lengths are the firmer number.

We checked 61 pages, each at phone and desktop width, both before and after a
click. 121 of 122 ended with the same tab stops. The one difference is a table
inside a closed `<details>`, which Chrome doesn't lay out, so it gets its tab
stop when it is opened instead of before. Pressing Tab after opening it lands on
the table with either script.

The full measurements, and what is still slow (mostly 38 module preloads that
Lighthouse's simulator counts as render-blocking), are in the
[polish report](../reports/polish-2026-11-11-scroll-sweep.md).
