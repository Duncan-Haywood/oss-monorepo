---
title: "Her own rate downtown: per-person site wages in a two-shop roster"
seo_title: "Scheduling staff who are paid a different rate at each location"
date: 2026-11-14
tags: [shift-roster-builder, product, measurement]
description: "One line on a staff row now gives a person their own rate at one shop. On made-up weeks, ignoring those rates understated payroll by 2 to 4%."
---

Earlier today [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) learned [to pay one shop more than another](2026-11-14-shift-roster-the-city-shop-pays-more.md): a city minimum wage, an airport premium, set once per shop and applied to everyone who works there.

Real pay is messier than one rule per shop. Someone who transferred from the airport kept their airport rate. A shift lead gets a set rate at the flagship. One person gets a dollar more downtown because parking costs them. None of that fits a rule that applies to everyone.

## What the tool does now

A person's row in the staff list can carry `wage at Airport: 24`, which is their hourly rate there. It can also say `wage at Airport: +2` or `+10%`, relative to their own wage, or `-1` for a lower rate. A person can have one per shop.

Two choices needed making:

- **The person's rate replaces the shop's premium.** If the airport pays everyone $3 more and Ana has agreed $24 there, she gets $24, not $27. A rate agreed with one person is usually the whole rate.
- **It never goes under the shop's floor.** If a shop is inside a city with a $21.30 minimum and someone's row says $19 there, they are paid $21.30. A personal agreement can't take a legal minimum away.

The rates go into the same table the builder already used for site wages. The search, the exact check that proves no cheaper roster exists, the call-out cover finder and the overtime rules all read them with no further change. Overtime is still paid on each person's average rate for the week. The report names who is on their own rate at each shop.

## What it changes, on made-up weeks

I reused the 40 made-up weeks from the site-wage test: a seven-day city shop with a $21.30 floor, a smaller suburban shop at the $17.13 state minimum, and ten people who can work at both. Then I gave some of them a personal premium of $1 to $4 at the city shop. I compared two builds. One knew the city floor but not the personal premiums, which was the best the tool could do before today. The other knew both. Each first roster was then costed with the premiums paid.

| share of people with their own city premium | what the floor-only roster said | what it really cost | built knowing the premiums | saved |
|---|---|---|---|---|
| 3 in 10 | $242,884 | $247,748 | $246,577 | $1,171 (0.47%) |
| 6 in 10 | $242,884 | $252,081 | $250,468 | $1,614 (0.64%) |

Without the premiums, the builder's total was 2.0% low with three people in ten on one, and 3.8% low with six in ten. A manager would only find that out when payroll ran. With them, the search moved city hours to people who cost the floor and no more. It was cheaper in 32 and 38 of the 40 weeks and never dearer. No week left a single hour more uncovered.

The saving is small next to the reporting error. That is the honest finding. The bigger value is a payroll figure that matches what gets paid.

## What this does not show

The teams, premiums and base wages are made up; only the two minimum wages are real. No real business's per-location pay has been read. The importers for 7shifts, When I Work and staff CSVs don't yet fill these cells from a per-location wage column, which is the next step. This is a planning aid, not payroll or legal advice.

The script is `ventures/shift-roster-builder/eval/own-site-wages.mjs` and its output is checked in next to it.
