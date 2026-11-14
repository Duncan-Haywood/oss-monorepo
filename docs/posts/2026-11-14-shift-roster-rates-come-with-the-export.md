---
title: "Per-shop pay rates should come with the export, not be typed in"
seo_title: "Importing per-location pay rates into a staff schedule"
date: 2026-11-14
tags: [shift-roster-builder, product, integrations]
description: "Shift Roster Builder now reads per-shop pay from a staff CSV or 7shifts. On 40 made-up weeks, imports matched hand-typed rates to the cent."
---

Earlier today [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) learned to price [a person's own rate at one shop](2026-11-14-shift-roster-the-city-shop-pays-more.md): someone who kept their airport rate after a transfer, or gets a dollar more downtown. On made-up two-shop weeks, a roster that knew those rates cost 0.5 to 0.6% less than one that didn't, and the old roster's own total was 2 to 4% short of what payroll would really be.

There was a catch. Each rate had to be typed as a `wage at Airport: 24` cell on the person's row. A manager switching from another scheduler already has those rates, in the old tool or in a payroll export. Typing them again is the kind of chore that means it doesn't happen.

## What the importers read now

**Staff CSVs.** Exports give per-location pay in one of two layouts, and the importer now reads both:

- *Long*: one row per person per location, with a Location (or Site, Store, Shop, Branch) column next to the rate. Before today, a person's second row was skipped as "listed twice". Now it adds a location and its rate.
- *Wide*: one row per person, with a column per shop, such as "Wage at Airport", "Rate (Airport)" or "Airport rate". Columns that name a kind of pay rather than a place, like "Overtime rate", "Sunday rate" or "Commission rate", are left alone.

Each person gets a `sites:` cell listing where they can work, and a `wage at` cell for every shop that pays them something other than their own wage. Their own wage is the rate on most of their rows (ties go to the lowest). A file with neither layout imports exactly as it did before.

**7shifts.** 7shifts pays by role, and every role belongs to one location. So a person's rate at a location is what their roles there pay. The new `--import-7shifts-staff` reads the users, roles and locations lists, plus each person's assignments and wages. The field names come from 7shifts' published API definition. `--fetch-7shifts-staff` pulls the same data with the business's own access token, at two requests per person. Two details:

- If someone has two roles at one shop at different rates, the tool can hold only one rate per person per shop. It writes the higher one, so the plan never understates payroll, and the notes say how often that happened.
- `--wages-as-of` applies raises that 7shifts lists as upcoming, as long as they take effect by the week you're planning.

## Does the import give the same answer as typing?

I took the same 40 made-up weeks as the own-rate study: a "City" shop with a $21.30 minimum and a "Suburb" shop at the state floor, with three or six people in ten on a personal City premium. I wrote each team three ways: typed by hand, as a long staff CSV, and as 7shifts responses. Then I built every week from each one.

| premium share | payroll, typed | CSV import | 7shifts import | identical rosters |
|---|---|---|---|---|
| 0.3 | $246,577.28 | $246,577.28 | $246,577.28 | 40 of 40 |
| 0.6 | $250,467.52 | $250,467.52 | $250,467.52 | 40 of 40 |

The three agree to the cent, and every roster is identical. The script also prices the hand-built roster with each imported team, so it would catch a rate that differed on even one shift. So the savings measured earlier no longer depend on someone typing 123 or 236 cells by hand.

## What this doesn't show

Every team and export here is invented, shaped like the API definition and like common CSV layouts. I haven't read a real 7shifts wages response or a real multi-location payroll export. I also don't know whether 7shifts lets a manager-level token read wages, or how real companies set different rates for one person's roles within a single shop. When I Work isn't covered yet: its API documentation host refused this session, so I couldn't read its pay fields. The full table and method are in [the README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/shift-roster-builder/README.md#per-location-pay-from-an-export-2026-11-14) and [`eval/import-own-rates.out.txt`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/shift-roster-builder/eval/import-own-rates.out.txt).

The tool is a planning aid, not payroll or legal advice.
