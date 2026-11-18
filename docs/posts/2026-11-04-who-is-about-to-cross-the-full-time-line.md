---
title: "Who is about to cross the full-time line?"
date: 2026-11-04
description: "The shift roster CLI gains --hours-watch: list who a planned week pushes to a full-time or benefit threshold you choose."
tags: [shift-roster-builder, scheduling]
---

# Who is about to cross the full-time line?

Small employers often have a number in mind, 30 or 32 hours, where a part-timer
becomes eligible for something. A roster that quietly gives someone 31 hours
costs money nobody planned for.

`node cli.mjs --hours-watch 30 staff.txt shifts.txt` builds the week as usual and
lists everyone at or over that line, plus anyone within `--watch-within` hours
(default 2) under it. It is arithmetic on one week and a number you type.
Eligibility rules usually count a longer period, and the tool says so and makes
no claim about any law. Tested on hand-built weeks, not on a real payroll.
