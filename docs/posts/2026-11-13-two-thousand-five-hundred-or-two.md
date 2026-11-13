---
title: "Two thousand five hundred, or two"
seo_title: "Why a calculator read 2,500 as 2, and a sweep that types the comma"
date: 2026-11-13
tags: [tooling, quality, javascript]
description: "A Playwright sweep typed 2500 and 2,500 into 1,476 number fields on 330 pages. Three planners read the comma version as 2. They now read 2,500."
---

Many of the calculators here use a text box with `inputmode="decimal"` for
numbers, not `type="number"`. A phone still shows the number pad, and the
browser doesn't throw away a value it can't parse. The catch is that the
page's script then gets exactly what the person typed. People type
amounts the way they write them: `2,500`.

In JavaScript, `parseFloat("2,500")` is `2`, because it stops at the first
character it can't read. `Number("2,500")` is `NaN`, and a page that writes
`Number(x) || 0` turns that into 0. Neither one shows an error. The page
just answers for a different number.

## The sweep

`platform/ci/check_comma_input.mjs` loads every venture page that has a
numeric text field: 330 pages and 1,476 fields. For each field it types
`2500`, clicks the page's Calculate button and keeps the page text. Then it
reloads the page, types `2,500` and does the same. If the two page texts
match, the field is fine. If they differ, the hit goes into one of two groups.
A hit is *rejects* when the comma run adds an error message, and *silent*
when it changes the answer and says nothing.

The first pass found 37 silent fields and 8 rejects. Most of the silent
fields were percentages, day counts and revision rounds, where nobody types
1,000 or more. They are now in an allowlist in the script, each with its
reason. Three pages had real misreads:

- **greenhouse-bench-planner.** A 2,500 sq ft bench typed with a comma was
  planned as **2 sq ft**: "1858 of 1870 units do not fit · peak bench 2 of 2
  sq ft". The germination area, plant density and hold weeks had the same
  fault.
- **mushroom-fruiting-room-planner.** Every input went through
  `parseFloat`, so a $2,500 weekly fixed cost or 1,200 fruiting slots were
  planned as $2 and 1 slot. The weeks fields gave no error either. They
  accepted "2,500" as 2 weeks and printed "Plan updated."
- **coffee-roaster-margin-calculator.** The page's own `Number(v(...))`
  calls read "2,500" lb per hour as 0, so the profit-per-roasting-hour
  column disappeared. The break-even line could also print fixed costs as
  $NaN. The calculation module already stripped commas. Only the page's
  glue code didn't.

Each fix removes the commas only when the whole value is a correctly grouped
number (`-?\d{1,3}(,\d{3})+(\.\d*)?`). So `2,500` becomes 2500. `2,5` is
still rejected, so a European decimal is not quietly read as 25. A new test
in the mushroom planner's suite checks both cases.

## Why the other tools were already fine

Most calculators parse through a module that already strips `$`, `,` and
`%` before reading the number. The invoice maker's amounts and the coffee
roaster's own calc module work that way. The bugs were in hand-written page
code that skipped the shared parser. A static grep for `parseFloat(` can't
tell those two cases apart. Typing the comma into the real page can.

Run it with `node platform/ci/check_comma_input.mjs [path-substring ...]`.
It exits 1 when a field outside the allowlist changes its answer silently.
