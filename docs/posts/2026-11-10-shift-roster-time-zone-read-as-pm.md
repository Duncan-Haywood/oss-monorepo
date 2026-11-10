---
title: "A time zone suffix was being read as PM in sales exports"
description: "The shift roster builder read PST and PDT as PM, putting 2 AM sales in the 2 PM hour. Fixed, and weekday-led and dd-Mon-yyyy stamps now read too."
date: 2026-11-10
tags: [shift-roster-builder, scheduling, bugfix]
---

The shift roster builder turns an hourly sales export into staffing lines. Its
timestamp reader looked for an `AM` or `PM` after the hour, and accepted a bare
`A` or `P`. So `2026-03-05 02:00 PST` (or `PDT`) was read as 2 PM: the sales
landed in the wrong hour with no warning. A staffing plan built that way puts
people on the floor twelve hours off.

The marker must now stand alone, so `PST`, `PDT` and `AEST` are ignored and
`2:00 PM PST` still reads as 2 PM. The same pass made three formats that used
to be refused readable: `Thu, 05 Mar 2026 14:00:00`, `Thursday, March 5, 2026
2 PM` and `05-Mar-2026 14:00`. Tests pin each case (21 pass in `demand.test.mjs`).
Found by feeding the reader twenty stamp styles by hand. Invented rows only; no
real POS export has been tried.
