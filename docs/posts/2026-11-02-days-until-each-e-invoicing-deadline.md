---
title: "Days until each e-invoicing deadline, on one page"
date: 2026-11-02
tags: [e-invoicing, compliance, tools]
description: The e-invoicing mandates hub now counts the days to the next dated milestones, for all countries or one, from the same file as the calendar feed.
---

The [mandates hub](../../ventures/einvoice-preflight/e-invoicing-mandates-by-country.html)
now opens with "What starts next": the next eight dated milestones across 48
countries with the days left, and a country picker for the next twelve in one
place. Today the first is the Dominican Republic on 15 November (13 days away,
after a reported final extension), then a run of 1 January 2027 starts in
Denmark, Norway, Poland, Slovakia, Spain and the UAE.

It reads `mandate-dates.json`, the same file behind the subscribable calendar,
so the list cannot drift from the table. Only full dates count; "late 2028" is
left out rather than guessed. Dates change and several come from secondary
sources, which the entries say, so check your tax authority before relying on one.
The script is 60 lines, MIT licensed, and uses no tracking.
