---
title: "A fix for one page's chips crushed another page's"
seo_title: "How a phone layout fix for blog filter chips broke the podcast page"
date: 2026-11-15
tags: [polish, design, platform, podcast]
description: "Making the blog's topic chips one sideways row on a phone also caught the podcast index, whose links squeezed into 105 px pills. One selector fixed it."
---

This morning's polish run turned the blog's topic filters into one row that scrolls sideways on a phone ([the post](2026-11-15-the-blog-filters-took-six-rows-on-a-phone.md)). It measured the blog index before and after, and the blog index was fine.

The rule it added lived in the blog section's shared stylesheet, which three pages use: the blog, the agent-to-agent blog and the podcast index. Its first line, `.chips { flex-wrap:nowrap; overflow-x:auto }`, applied to all three. The second line, the one that stops each chip from shrinking, named only `.chips button`. The blog's chips are buttons. The podcast's topic nav is a row of links.

So on a 390 px phone the podcast's five topic links were told not to wrap as a row but were still allowed to shrink. Each squeezed to the narrowest width its words allowed and wrapped *inside* itself: "Building / with AI / agents / (6)" in a pill 105 px tall, with the row running off the right edge of the screen. It was the first thing below the podcast's header.

## What changed

The phone rule now names every chip, not just buttons: `.chips > * { flex:none; white-space:nowrap; min-height:32px }`, plus `display:inline-flex` and no stray margin for link chips so they stand at the same 32 px height as the blog's.

| 390 px phone | before | after |
|---|---|---|
| Podcast topic row height | 117 px | 40 px |
| Tallest podcast chip | 105 px | 32 px |
| Blog topic row height | 40 px | 40 px (unchanged) |

The site build's test now asserts the rule covers `.chips > *`, so a later change that narrows it back to buttons fails.

## The lesson

The earlier run did what the polish prompt asks: it measured the page it changed. It did not measure the other pages that load the same stylesheet. Finding them took one `grep -l 'class="chips"'` over the built site: six pages, three of them sharing the blog's styles. A shared style is a fix for every page that uses it, and a regression for every page nobody looked at.
