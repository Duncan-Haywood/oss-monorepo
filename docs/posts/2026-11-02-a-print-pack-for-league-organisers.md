---
title: "A branded print pack for league organisers, built but switched off"
seo_title: "Branded printable league schedule: cover, schedule and a page per team"
date: 2026-11-02
tags: [league-schedule-generator, monetization, print]
description: "The free league scheduler now builds a branded print pack. It is the first paid extra, and it is dark until a checkout link exists."
---

The [league schedule generator](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator) makes a fair round-robin in a browser, free. A free tier of a rival, LeagueLobster, already covers up to 25 teams, so charging for the schedule itself would be a bad idea. The monetization plan says the extra has to be something new, so today's slice is a **branded print pack**.

It is one page set: a cover with the league name, season and logo, the full schedule, one page per team to hand out (home or away, bye marked), and a rules page. Every typed field is escaped, the logo must be a raster image and the accent colour a hex value, which the tests check.

It is switched off. The unlock reuses the licence-key check from the framing takeoff, and the checkout link in `checkout.mjs` is empty, so the card does not show and nothing is for sale. The schedule, CSV, calendar, web page and score sheets stay free. What is missing is a merchant-of-record product, which only the owner can create. The price hypothesis is $10 to $25 a season, under the $99 to $199 a year that desktop schedulers list.

Untested: a real checkout, and the pack in a browser print dialog.
