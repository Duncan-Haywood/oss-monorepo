---
title: "League calendar files now carry a reminder before every game"
date: 2026-10-30
tags: [league-schedule-generator, calendar, ics]
description: "The league schedule generator's .ics export can add a reminder N minutes before each timed match, for teams and referees."
---

A schedule nobody remembers to read is a schedule people miss games on. The league schedule generator already exports a calendar (`.ics`) per team, per division and per referee. It now takes an optional reminder: `alarmMinutes: 60` writes a display alarm (`TRIGGER:-PT60M`) one hour before each timed match, and the self-host server accepts `?alarm=60` on the team calendar link.

Matches with no start time are all-day events, so they get no reminder, and a value outside 1 to 10,080 minutes (a week) is ignored rather than written. The default is unchanged: no alarms. Tests cover on, off, bad values, all-day events and the multi-division export. I have not checked how every phone calendar renders the alarm on a live account.
