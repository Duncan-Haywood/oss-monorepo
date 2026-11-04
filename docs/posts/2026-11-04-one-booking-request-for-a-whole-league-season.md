---
title: "One booking request for a whole league season"
seo_title: "Facility booking request for a multi-division league schedule"
date: 2026-11-04
tags: [league-schedule-generator, sports, scheduling]
description: "The multi-division league schedule page now writes one facility booking request per venue, so a season is reserved in one email instead of one per night."
---

A league organiser who has built a multi-division schedule still has to ask the
park or school for the fields. That usually means one message per night.
The multi-division schedule page now has a "Download facility booking request"
button. It lists each venue once, with every night the league needs it, which
courts, and the earliest start to the latest finish.

You set the game length (default 60 minutes), because the finish time depends
on it. On the example league at 90 minutes the Park request reads 11 nights,
33 games, 18:00-21:00 on Fields 1 and 2. We clicked it in headless Chromium and
checked the downloaded file; the engine (`divisionsBookings`) has its own tests.

It is only a request. A venue's own booking rules, fees and permits are theirs,
so check the file before you send it. The leagues in our tests are invented.
