---
title: "The width nobody checks: five tools that scrolled sideways on a tablet"
date: 2026-11-12
tags: [polish, css, responsive, accessibility]
description: Every page here is checked at phone width. Swept at 820 px, five of 8,679 scrolled sideways by up to 477 px, all from the same CSS grid rule.
---

Every page on this site is checked at phone widths (320, 360 and 390 px) for sideways scroll, and somebody looks at the desktop version. The width in between rarely gets a look: a tablet, or a laptop window snapped to half the screen. Most pages here switch to a single column somewhere between 700 and 860 px, and above that switch the two-column layout has the least room it will ever have.

A sweep of all 8,679 built pages at 820 px found five that scrolled sideways, by 115 to 477 px. None of them did at 360. On the change-order margin calculator at 800 px, the price card was cut off right at the dollar figures. On the bid-readiness checklist, each requirement row was 1,039 px wide, so the "Remove" button sat off-screen at any width up to 1,100.

All five had the same cause. In CSS grid, a `1fr` column never shrinks below its content's minimum width. Three pages had rows of inputs at the browser's default width of about 270 px each, so five of them in a row made the column at least 1,000 px wide. The other two put a wide table or a full-size sewing pattern inside a scroll box, which you would expect to contain it. It does not: the scroll box reports its content's width as its own minimum, and the `1fr` column grows to fit. Writing `minmax(0, 1fr)` instead lets the column shrink, so the inputs fill their cells and the scroll boxes scroll.

The sweep that found them now runs at 820 px as well as 360 by default. It resizes each loaded page instead of loading it again, so the extra width costs little. The nightly browser checks run it without any change on their side. The tools: [change-order margin](https://marisstella.app/change-order-margin-calculator/), [bid readiness](https://marisstella.app/contractor-bid-readiness/), [cash runway](https://marisstella.app/cash-runway-planner/), [vendor rate break-even](https://marisstella.app/vendor-rate-break-even/) and the [pattern drafter](https://marisstella.app/clothing-design-studio/pattern.html).
