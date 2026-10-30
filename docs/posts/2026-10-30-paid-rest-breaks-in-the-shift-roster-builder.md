---
title: "Paid rest breaks, staggered so the floor is never empty"
seo_title: "Schedule paid rest breaks that keep the floor covered"
date: 2026-10-30
tags: [shift-roster-builder, scheduling]
description: "The free shift roster builder now suggests paid rest breaks of the length and spacing you enter, placed around meal breaks and staggered so someone stays on."
---

The free shift roster builder already suggested an unpaid meal break for any long stretch. It now does the same for paid rest breaks. Two new boxes under the meal-break settings take how many hours worked straight earn a break (0 leaves it off) and how many minutes it lasts. For each stretch, back-to-back shifts joined, it places one break per full block of hours, centred in its own part of the day, clear of that person's meal break, and chooses the five-minute mark that keeps the most colleagues on the clock. A break with nobody else on is marked.

The numbers are yours: the tool has no built-in law on when breaks are owed, and the page says so. Paid time changes no payroll figure, and the search does not enforce breaks; this is a planning aid after the roster is built. Everything still runs in your browser. The function is `placeRestBreaks` in `calc.mjs`, with tests.
