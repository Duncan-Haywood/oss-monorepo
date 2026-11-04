---
title: "Is your first ad test telling you anything? A 95% range on forty clicks"
seo_title: "How to read a small ad test: conversion rate range and cost per sale"
date: 2026-11-04
tags: [ventures, clothing-design-studio, marketing, statistics]
description: "The clothing design studio now reads a first small ad test: your real click price, conversion rate with a 95% range, and whether the test settles go or stop."
---

A new clothing brand spends 20 on an ad, gets 40 clicks and one order. Is that
a 2.5% conversion rate and a cost per sale of 20? Not really: with one order,
the 95% Wilson interval on the rate runs from about 0.4% to 12.9%, so the true
cost per sale could be anywhere from about 4 to 130. If each sale leaves 25
after cost, tax and fees, that test cannot say go or stop.

The [clothing design studio](../../ventures/clothing-design-studio/index.html)
launch planner now has a "Read a first small ad test" box. Type what you spent,
the clicks and the orders. It shows your real click price, conversion rate and
cost per sale, the 95% range, and one of four verdicts: go (even the worst end
of the range pays), stop (even the best end loses), unclear (with roughly how
many more clicks would settle it), or no margin (fix price and cost first).
"Use these numbers" replaces the placeholder assumptions in the calendar.

The interval and verdict logic is in `marketing.mjs` with hand-checked tests
(zero orders, bad input, a large losing and a large winning test). It is
arithmetic on numbers you type; nothing is bought or posted, and it has not yet
been used on a real designer's campaign.
