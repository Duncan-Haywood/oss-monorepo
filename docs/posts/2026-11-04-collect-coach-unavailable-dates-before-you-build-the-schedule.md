---
title: "Collect coach unavailable dates before you build the schedule"
date: 2026-11-04
description: "The multi-division league scheduler now hands you the sign-up sheet to send coaches, and reads the filled copy back as blackout dates."
tags: [league-schedule-generator, scheduling, sports]
---

# Collect coach unavailable dates before you build the schedule

The scheduler could already read a coach sign-up export as team blackout dates.
It did not help with the step before: getting the sheet to the coaches.

The multi-division page now has **Download a sign-up sheet for coaches**. It
writes a CSV with one row per team (Division, Team, an empty "Dates
unavailable" column), built from the divisions you typed. Send it round, and
load the filled copy in the box below. Dates can be comma or semicolon
separated or ranges such as `2026-11-05 to 2026-11-12`. A unit test fills a
sheet and checks it reads back as the same blackouts, including team names with
commas.

Checked on made-up leagues only; a real league's returns are still wanted.
