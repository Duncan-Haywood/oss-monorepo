---
title: "The Breadcrumb That Repeated the Heading: Research Pages on a Phone"
seo_title: "Mobile Breadcrumbs: Drop the Last Crumb When the h1 Repeats It"
date: 2026-11-15
tags: [design, research, mobile]
description: "On 1,080 research project pages the phone breadcrumb showed 9 characters of the topic and a cut copy of the page title. Now it shows the topic in full."
---

Every [research](/research/) project page has a breadcrumb under the site header: Research, then the topic, then the project. On a 390 px phone that trail is one line, and it read like this:

> Research › Proper … › What does a verifier's silence t…

The topic, the one link there a reader might want to follow, got about 9 characters. The rest went to the project's title, cut at about 33 characters. But that title is the page's heading, word for word, and it sits about 150 px lower down. The trail was spending its width on a clipped copy of something already on screen.

Now, on screens under 600 px, a crumb marked as repeating the page's `h1` is hidden along with the separator before it. The trail reads "Research › Proper scoring & elicitation", and the heading names the page. Desktop keeps the full trail.

Measured across all 1,080 project pages at 390 px: the topic was shown in full on 0 pages before and 1,080 after. The longest topic name, 38 characters, also fits at 360 px. The row stays 27 px tall and no page scrolls sideways. The structured-data breadcrumb and the markup are unchanged, so search engines and screen readers on desktop see the same trail.

Tool pages are not changed. A tool's breadcrumb name and its heading often differ, so hiding it there needs a check first. That is the next step in the [report](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-15-crumb-echo.md).
