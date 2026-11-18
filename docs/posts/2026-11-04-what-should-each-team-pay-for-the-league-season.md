---
title: "What should each team pay for the league season?"
date: 2026-11-04
description: "The league scheduler can now turn its facility booking request into a season cost and a fee per team, from the organiser's own rates."
tags: [league-schedule-generator, league-fees]
---

# What should each team pay for the league season?

Most rec leagues set the fee by guessing, then discover in week six that the
fields cost more than the entry money. The scheduler already knows exactly how
many court-hours it books, so it can do the sum.

`divisionsFacilityCost` takes the season's booking request, one rate per venue
(`Riverside Park: $45/court-hour`) and any fixed costs such as insurance, and
returns the cost per venue, the total and a fee per team. It can split the
total evenly over every team or by each division's share of the games.

Two choices keep it honest. A venue with no rate is named and left out of the
total instead of being guessed. And the arithmetic is only on the numbers the
organiser typed: the test counts a two-venue season by hand (5 court-hours at
$40 plus 3 unpriced, $60 extra, 6 teams) and gets $260 and $43.33 a team.

What is missing: a page button, and a real league's facility invoice to check
the court-hour counting against. If you run a league and will share one
(venue names removed), the custom-development page takes it.
