---
title: "Who should have had that shift? A seniority report for the roster builder"
seo_title: "Seniority shift report for employee schedules"
date: 2026-10-30
tags: [shift-roster-builder, scheduling]
description: "Shift Roster Builder now takes a seniority rank per person and lists every shift a more senior person could have taken without breaking any hard rule."
---

Many workplaces, and most union contracts, give senior staff first call on hours. A schedule built only to minimise payroll hands the cheap shifts to the newest, lowest-paid people, which is exactly what a seniority grievance is about.

[Shift Roster Builder](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/) now reads a `seniority: 3` cell (higher means more senior). After the roster is built, it checks each shift held by a junior person. If a more senior person is available and has the role, and giving them the shift keeps every hard rule (rest between shifts, weekly hours, days in a row, overlap), the page lists it with the payroll change and whether the senior is under their minimum hours.

It is a report, not a search rule, so the roster itself does not change. Contract terms such as bidding rounds or hours guarantees are not modelled, and the page says so. A manager can use the list to decide which swaps to make, and what each costs.
