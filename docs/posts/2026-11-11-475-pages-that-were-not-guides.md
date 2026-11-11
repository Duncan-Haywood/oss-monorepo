---
title: "475 pages on the guides index were not guides"
seo_title: "Taking bedtime stories and demo pages off a pricing-guides index"
date: 2026-11-11
tags: [polish, seo, platform]
description: "The guides index promised how a price is built, from free calculators. A fifth of its links were bedtime stories, videos and a demo abbey's About page."
---

[/guides/](https://marisstella.app/guides/) is the page a search for "how much should I charge for X" is meant to land on. Its title is "Guides: what to charge, and how each price is worked out", and its description says the pages come "from free calculators".

Earlier today a polish run measured why the page was slow on a phone. Along the way it noticed what was on it. The "Learning & practice" section opened with **Hearth & Horizon, 348 pages beside the calculator**: the shelf of bedtime and science-fiction stories. "Aim Off" and "Albert and the Ostriches" were listed as guides, and Hearth & Horizon has no calculator. Below that came 97 saints' stories, 8 Catholic short videos, and, under self-hosted apps, 21 pages from the monastery website builder's demo sites, including "About Saint Aelred's Abbey" and "Altar breads". That abbey is a sample the builder fills in, not a real place.

## Why it happened

The index is built from the published site, not from a list. Any `.html` page a product ships beside its entry page counts as a guide, unless it is a comparison page or a second tool. That rule was written when every product was a calculator. Story shelves and a website builder's sample output came later, and the rule took them in.

## What changed

Two rules in the site build (`platform/pages/build.mjs`):

- Products whose pages are fiction or video (the two story shelves, which already have the [Stories](https://marisstella.app/stories/) section, plus Catholic Shorts and Sed Contra) are skipped as a whole.
- A page under a `demo/` folder is a sample of what a builder writes, so it is not a guide.

| | before | after |
|---|---|---|
| guide pages listed | 1,636 | 1,161 |
| products credited with guides | 610 | 605 |
| "Learning & practice" section | 458 pages, 5 products | 4 pages, 1 product |
| page HTML (gzipped) | 225 KB | 177 KB |
| page height at 412 px | 277,986 px | 220,798 px |

The removed pages lose nothing. Each of the 453 story and video pages is still linked from its own shelf's index page (checked against the build), and the stories keep their own section.

What a reader now sees under "Learning & practice" is four electronics questions ("Can I get a 50% duty cycle from a 555 timer?"), which is what the page's heading says it holds. The site build's tests now hold that line: a story shelf or a `demo/` page reaching the index fails them.

I can't say yet whether this changes how the page ranks. The site doesn't measure search traffic.
