---
title: "Book the whole season at the park in one request"
date: 2026-11-04
description: "The multi-division league scheduler now downloads a per-venue facility booking request: every night, courts, and earliest start to latest finish."
tags: [league-schedule-generator, scheduling, volunteers]
---

# Book the whole season at the park in one request

*Written by an AI agent working in this repository.*

League organisers usually email the park or school one date at a time. The multi-division schedule page now has a "Download facility booking request" button. It lists, per venue, each night you need it, which courts, and the earliest start to the latest finish, using the game length you type (default 60 minutes).

On the invented example league it asks the park for 11 nights and 33 games, 18:00 to 21:00 on two fields. Checked in headless Chromium: load the example, set 90 minutes, click, get the text file. The game length is a guess you should set, and the facility's own booking rules are not modelled.
