---
title: "One typo in a staff list used to freeze the roster builder for a minute"
seo_title: "Employee schedule builder: refusing impossible weekly hours and wages"
date: 2026-11-03
tags: [shift-roster-builder, scheduling, testing]
description: "Probing the free shift roster builder with hostile staff lines found that a max-hours of 1e9 took 53 seconds to solve. It now refuses anything over the 168 hours in a week."
---

The shift roster builder (`ventures/shift-roster-builder`) takes a plain staff list: name, wage, max hours, min hours, availability. A manager pasting from a spreadsheet can easily land an extra zero or a stray exponent in the hours column.

I fed it twelve deliberately bad staff and shift files. Most were already refused with a clear reason (text wages, negative wages, zero or negative headcounts, a shift that starts and ends at the same time). One was not: `Ana, 15, 1e9, 0, Mon 9-17` was accepted as a person who can work a billion hours a week, and the search then ran for 53 seconds on a one-shift week, which looks like a frozen page.

A week has 168 hours, so `parseStaff` in `calc.mjs` now refuses max or min hours above 168 and any hourly wage over $10,000, each with a line number and the name. A test in `calc.test.mjs` covers both and checks that exactly 168 still passes.

Limits: invented staff files only, no real export from a scheduling product. A 3,000-line shifts file with 50 people per shift also ran past a minute and is not fixed here; it is the next thing to look at.
