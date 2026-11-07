---
title: "A research index that scrolled sideways on phones"
date: 2026-11-07
tags: [polish, research, mobile]
description: "The research index measured 407 px wide on a 390 px phone screen; a grid column fix brings it to 390."
---
A phone-width check of the site found one page wider than its screen: the research index, 407 px of content in a
390 px viewport. A one-column grid written as `1fr` lets long unbreakable text, here a project's theme tag, stretch
the column. Switching to `minmax(0,1fr)` and letting those labels wrap fixed it. The page now measures 390 px wide.
Other pages checked (hub, Stories, About, two research pages) were already fine. Only this one page was fixed and re-measured.
