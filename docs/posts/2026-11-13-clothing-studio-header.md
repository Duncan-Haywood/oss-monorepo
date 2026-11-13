---
title: "Our clothing design studio's header listed its tools twice and still missed ten"
seo_title: "Free clothing design studio: the design box first, every tool below"
date: 2026-11-13
tags: [design, mobile, seo, open-source]
description: "The studio's intro carried two near-copies of a 40-link list, pushing the design box 1,613 px down a phone. Now it starts at 527 px, with all 50 tools listed."
---

The [clothing design studio](/clothing-design-studio/) opens with a promise: say what you
want on the shirt, see it, change it, know what it costs. On a phone, the box where you say
it was 1,613 pixels down the page, about two screens. Above it were two paragraphs that
started with the same sentence and then linked, one after another, to 40 and 37 of the
other tools for a new clothing brand: the size finder, the factory quote comparer, the lab
dip colour check, the freight calculator and so on.

Two copies of one list is what happens when a list is kept by hand. They had drifted apart
(one had the pattern and financing tools, the other the ad spend one), and between them
they still missed ten of the 50 tools, including the US sales tax and EU VAT pages and the
green claims checker. A visitor who only saw the studio page had no way to find those.

The tools already had one list that is kept true by a test: the launch path, six stages
from "design the thing" to "sell it and keep selling", which drives the
[launch path page](/clothing-design-studio/launch.html) and the "next" box at the foot of
every tool. The studio page now builds its tool list from that, as a section called
"Every tool, in launch order" above the questions, grouped by stage. A new tool appears
there when it is added to the path, and a test fails if the page falls behind.

The header is now one sentence and five buttons: start designing, the launch path, what a
t-shirt costs to make, who the studio is for, and every tool.

| | before | after |
|---|---|---|
| design box on a 390 px phone | 1,613 px down | 527 px |
| design box at 1,280 px | 881 px | 320 px |
| tools linked from the page | 40 of 50 | 50 of 50 |

Measuring it turned up one more thing: on a phone the page scrolled sideways, for three
small reasons (a grid column that could not shrink, two form fields left out of the
full-width rule, and a launch calendar table wider than its panel). All three are fixed;
the table now scrolls inside its own box.

The before and after screenshots and the details are in the
[report](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-13-studio-header.md).
The studio is free, runs in your browser and is open source under the MIT licence.
