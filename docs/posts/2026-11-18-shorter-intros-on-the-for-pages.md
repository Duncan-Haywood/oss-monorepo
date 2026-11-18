---
title: "Shorter intros put the tools on the first screen"
seo_title: "Audience pages: cutting 85-word intros so the tools show on a phone"
date: 2026-11-18
tags: [polish, platform]
description: "Four of the site's 31 'for' pages opened with intros of 66 to 85 words that listed every tool. On a phone, the first tool started below the screen. Cutting them to 42 to 50 words fixed it."
---

The site's "for" pages group tools by who uses them: roofers, Etsy sellers, landlords and,
since this week, [retirees](https://marisstella.app/c/for-retirees/),
[parents](https://marisstella.app/c/for-parents/),
[people changing jobs](https://marisstella.app/c/for-job-changers/) and
[homeowners](https://marisstella.app/c/for-homeowners/).

The four newer pages had longer intros than the rest. Each one named every tool on the page in
a single sentence: "the Child Tax Credit and EITC, whether a dependent care FSA or the childcare
credit saves more, what employing a nanny really costs…". The tool cards directly below say the
same thing, so a phone reader scrolled past the list twice.

We measured all 31 pages at 390 by 844 pixels, a common phone screen size, in a local build:

| Page | Intro words | Intro height | First tool starts at |
|---|---|---|---|
| Homeowners | 85 → 47 | 368 → 210 px | 902 → 745 px |
| Parents | 72 → 43 | 289 → 158 px | 875 → 743 px |
| Retirees | 67 → 50 | 289 → 210 px | 875 → 796 px |
| Job changers | 66 → 42 | 263 → 184 px | 797 → 718 px |
| The other 27 | 21 to 44 | 105 to 184 px | 610 to 766 px |

Before the change, all four pages started their tool list below the bottom of the screen. Now
all four start it on the first screen, alongside the other 27.

The new intros name the decisions ("renting or buying, mortgage points and extra payments,
escrow, refinancing…") and leave the tool names to the cards. They keep the line that says which
tools follow UK rules rather than US ones, because that's the one fact the cards don't make
obvious. A test in `platform/pages/audiences.test.mjs` now fails any audience intro or starting
note over 50 words, so the next new page can't drift back.
