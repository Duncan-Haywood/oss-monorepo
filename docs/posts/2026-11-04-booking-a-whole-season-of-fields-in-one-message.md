---
title: "Booking a whole season of fields in one message"
seo_title: "League schedule to facility booking request: dates, courts and times per venue"
date: 2026-11-04
tags: [league-scheduling, sports, open-source]
description: "League Schedule Generator can now turn a multi-division schedule into a per-venue booking request, listing every night, court and time span a park or school needs to reserve."
---

A league organiser who has a finished schedule still has one chore left: telling each park or school which nights and courts to hold. Until now that meant reading the season grid and writing it out by hand for every venue.

League Schedule Generator now does it from the schedule. For each venue it lists the nights it is needed, the courts in use and the earliest start to the latest finish, with a count of nights and games. Run `node divisions.mjs spec.json --bookings` and paste the result into an email.

Game length defaults to 60 minutes, because the schedule stores start times only. That is an assumption, not a rule from any real facility. The tests check on the example league that every game is counted once and that spans are right; no real league has used it yet, and the page has no button for it yet.

Code (MIT): [`ventures/league-schedule-generator`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/league-schedule-generator).
