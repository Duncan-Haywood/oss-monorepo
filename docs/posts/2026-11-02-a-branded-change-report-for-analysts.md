---
title: "A branded change report, built dark, for changepoint-detector"
seo_title: "Branded changepoint report: letterhead PDF of a time-series analysis"
date: 2026-11-02
tags: [monetization, changepoint-detector, business-model]
description: "The free changepoint detector gains a paid, still-hidden presentation layer: its result on an analyst's letterhead, with assumptions stated."
---

The changepoint detector answers "when did this series change, and how sure are we?" in the browser, free, with nothing uploaded. That stays free: the detector, the CSV, the CLI and the agent engine.

Today's step is the only part that could ever be charged for: a one-page **branded change report**. It carries the analyst's name and logo, the same chart as the page, the plain-language reading, the change and segment tables, and a fixed assumptions paragraph that says a detected change does not show its cause. It prints or saves as PDF.

It is built **dark**: the card stays hidden until a checkout link is set in `checkout.mjs`, which waits on the owner creating one merchant-of-record product that serves all the dark paid paths. No sale has happened and no price is validated; the working hypothesis is $5 to $15 per report pack, set well below the per-host and per-metric monitoring tools (roughly $15 per host a month and up) because the buyer is one analyst, not a platform team.

Honest limits: the licence check is a convenience for honest buyers (the code is MIT), the validate call is written from the provider's docs and not run against a live product, and the site's measured traffic is still tiny, so distribution matters more than the paywall. The tests cover escaping of every typed string and series label and the logo and colour allow-lists.
