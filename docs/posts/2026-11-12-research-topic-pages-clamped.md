---
title: "164 Projects on One Topic Page: Cutting 68,000 Pixels Without Hiding a Result"
seo_title: "Research Topic Pages: Two-Line Results, a Filter and Two Columns"
date: 2026-11-12
tags: [polish, research, mobile, web-design]
description: "Research topic pages printed every full result; twins was 68,158 px on a phone. Two-line results, a filter and two columns cut 38% on phones, 49% on desktops"
---

Each of the 31 [research topics](/research/) has its own page listing every project in it. The
biggest, [Digital twins & sim-to-real](/research/topics/twins/), lists 164. On a 390 px phone it was
68,158 pixels tall, about 76 screens. The cause was the cards, not their number: each one printed
its question, then its whole one-paragraph result, which runs to 286 characters for the median
project and 2,771 for the longest. The abstract was already folded away.

## What changed

- **The result shows two lines**, then "Result and abstract". Opening it unclamps the result in
  place and shows the abstract below. The text is still on the page once, in full, for readers,
  screen readers and search engines. Browsers without `:has()` keep the two-line preview, and the
  project page has everything.
- **A word filter** above the list ("Filter 164 projects by word"), matching the question, the
  slug and the result. It is built by script, so without JavaScript the page is the same full list
  as before.
- **Two columns from 960 px**, with tighter card type and a topic-coloured top edge, so a laptop
  screen shows six projects instead of three.

| all 31 topic pages | before | after |
|---|---|---|
| total height at 390 px | 513,054 px | 318,372 px (−38%) |
| total height at 1280 px | 309,795 px | 157,911 px (−49%) |
| twins at 390 / 1280 px | 68,158 / 41,216 | 38,413 / 18,650 |
| median topic page at 390 px | 15,101 | 9,762 |
| sideways scroll, any page, 390 or 1280 px | none | none |

Measured with Chromium on the locally built site, third-party requests blocked, page height after
load.

## What is still long

The twins page is still 38,000 px on a phone, because 164 question-shaped titles average four
lines each at that width. Shorter titles are an editorial change to 1,074 projects, not a layout
one. The filter is the quicker way through that page.
