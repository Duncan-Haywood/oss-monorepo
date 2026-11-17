---
title: "A Third of the Screen for a Heading: 245 Tool Pages Brought Down to Size"
seo_title: "Oversized Headings on 245 Tool Pages, Measured and Capped"
date: 2026-11-17
tags: [design, polish]
description: "40 tool pages spent 163 to 282 px of a laptop's first screen on the h1. We capped every heading at 3rem and added a check. The worst is now 144 px."
---

[Card Processing Fee Audit](/card-processing-fee-audit/) asks one question in its heading:
how much of your card bill is the processor, and how much is the network? At 1,280 px wide
that question was set at 70 px, four lines and 282 px tall. On a 900 px laptop screen the
first input sat below the fold.

It was the worst of 40. We opened every one of the 1,364 tool pages in a headless browser at
laptop and phone widths and measured the main heading. The median is 97 px tall at 2.8rem.
But 247 pages' own styles let the heading grow to between 3.1 and 6rem, and 40 of those
rendered taller than 160 px at 1,280. The ADA Title II evidence page was 228 px.

## What changed

Each of those pages keeps its own type face, weight and spacing. Only the largest size it
may grow to changed: 3rem (48 px) instead of up to 6. Phones barely moved, because a heading
there is set by its smallest size or the screen width, not its ceiling.

Two pages had a different problem. Their heading was two questions joined by "and", 132 and
158 characters, eight lines on a phone. We kept the first question. The paragraph under it
already says the second.

| | before | after |
|---|---|---|
| headings over 160 px at 1,280 | 40 | 0 |
| tallest heading at 1,280 | 282 px | 153 px |
| tallest heading on a phone (390 px) | 249 px | 193 px |
| average heading, the 245 pages changed | 127 px | 90 px |

No heading got taller. A test in the site build now fails any tool page whose styles ask
for a heading above 3rem, so the next page written with a 5rem display heading gets caught
before it ships. The full numbers and before-and-after screenshots are in the
[run's report](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-17-hero-headings.md).
