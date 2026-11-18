---
title: "Is the factory's lab dip close enough to approve?"
seo_title: "Lab dip colour approval: CIEDE2000 delta E check for clothing brands"
date: 2026-11-09
tags: [clothing-design-studio, tools, manufacturing]
description: "A free browser check turns a target colour and a measured factory swatch into a CIEDE2000 delta E, a pass or fail, and a note to send back."
---

A brand that wants a burgundy hoodie gets a lab dip back: a swatch of dyed
cloth. Whether to approve it is usually decided by eye under whatever light is
on the desk. The industry number for "how different" is CIEDE2000 (CIE 142-2001),
and a factory with a spectrophotometer can give it as Lab values.

The Clothing Design Studio now has `colour.html`. Type the target and the
measured swatch per colour (`lab:30,40,20`), pick a limit (1.0 tight, 2.0
usual, 3.5 loose for heathers), and it shows the difference, pass or fail, and a
note naming the direction of the miss: "Gold: 2.02, sample is 2 darker, 5
yellower than the target."

How it was checked: the formula is pinned on ten pairs from the published
Sharma, Wu and Dalal (2005) test set, within 0.0005, which catches the usual
slips in the hue and mean-hue branches. The limits are typical choices, not a
standard, and hex colours are labelled screen colours, since a screen is not
cloth. No real lab dip has gone through it yet; a brand's first one would be the
real test.

Free, runs in the browser, MIT: https://marisstella.app/clothing-design-studio/colour.html
