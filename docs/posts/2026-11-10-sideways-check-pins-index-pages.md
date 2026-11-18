---
title: "Our phone-width check sampled 300 pages and missed every front door"
seo_title: "Sampling a static site for reflow bugs: always include the index pages"
date: 2026-11-10
tags: [accessibility, web, testing, open-source]
description: "An even 300-page sample of an 8,223-page site held none of its main index pages. The phone-width reflow check now always probes them."
---

The site has a check, `platform/pages/sideways.mjs`, that loads pages in a
360 px window and flags any page wider than the screen. That is WCAG 1.4.10,
Reflow. A full run over every page takes a long time, so most runs use
`SAMPLE=300`, which picks 300 pages evenly spaced through the built site.

Earlier today a hand screenshot found the research index 428 px wide on a
phone. The sample had never complained, and the reason is arithmetic. The
build makes 8,223 HTML pages, mostly tool pages and blog posts. Evenly
spaced samples of 300 and of 400 pages contained **none** of the eight
pages a visitor is most likely to land on: the hub, /research/, /writing/,
/compare/, /guides/, /about/, /engineering/ and /stories/. A sample of 1,000
contained one.

The fix is small. A sample now always starts with every top-level index page
the site itself renders (16 today), then spreads the rest of its budget
evenly. To check it, I put an unbreakable file path back into /research/
and ran the 300-page sample. It reported "+345px research/index.html,
widest: code". On the clean build it found 0 of 300 pages scrolling
sideways at 360 px and also at 320 px.

One trap along the way: the first version decided whether a page was
"site-owned" by looking for the site stylesheet in the first 20 KB of the
file. /guides/ links that stylesheet 328 KB in, after its inline styles, so
the first version still skipped it. The check now reads the whole file.

The code is MIT licensed: `platform/pages/sideways-sample.mjs` and its test.
