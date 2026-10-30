---
title: "Shift roster builder now prices split-shift premiums"
date: 2026-10-29
description: "The schedule notice flagged split shifts but never said what they cost; with your local minimum wage it now does."
tags: [shift-roster-builder, scheduling, labor-cost]
---

A split shift looks free on a schedule: two short blocks, same person. In some places (California and New York State, for example) it costs one extra hour at the minimum wage, and a day stretched over more than ten clock hours can owe the same premium. [shift-roster-builder](../../ventures/shift-roster-builder/) already flagged split shifts but gave no dollar figure.

Enter your local minimum wage on the page and the notice now adds up one premium hour per person-day that has a gap over an hour or a span over ten hours, burden included, and names who and when. The library function `splitShiftPay` also takes your own gap, span and hour counts and a California-style credit for pay above minimum.

It is an estimate for planning, not the search's objective and not a statement of any state's rule; check yours. It is tested on hand-built weeks, not on a real restaurant's payroll.
