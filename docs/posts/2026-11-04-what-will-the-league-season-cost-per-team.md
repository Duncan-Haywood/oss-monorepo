---
title: "What will the league season cost per team?"
date: 2026-11-04
description: "The multi-division league scheduler now turns court bookings and your venue rates into a season total and a fee per team, on the page and from the CLI."
tags: [league-schedule-generator, fees]
---

# What will the league season cost per team?

An organiser who has a schedule still has to set the fee. That means counting
court-hours per venue, multiplying by each venue's rate, adding insurance and
trophies, and dividing by teams.

The multi-division scheduler already booked courts per venue. It now prices them.
Type one rate per line (`Riverside Park: 45/court-hour`), add any other costs, and
download the total and a fee per team. A tick splits the cost by each division's
share of games. A venue with no rate is named and left out, never guessed.
From a script: `node divisions.mjs spec.json --cost rates.txt --extra 100`, which
exits 2 if a venue is unpriced.

It is arithmetic on your own rates. It was checked against a hand-counted
two-venue season and clicked in Chromium on a made-up league, not against a real
league's invoice. If you run one, tell us whether the court-hours match.
