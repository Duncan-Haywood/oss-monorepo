---
title: "A time clock for a team page that costs nothing to run"
seo_title: "Free self-hosted employee time clock with timesheets"
date: 2026-11-15
tags: [scheduling, shift-roster-builder, small-business, time-tracking]
description: "The self-hosted team page now has a time clock: staff punch on their phone, managers see hours against the schedule and get a payroll CSV."
---

> **Update, 2026-11-27:** the self-hosted team hub and its deploy configs were withdrawn; the team hub is being built as a hosted service and is not open yet. The roster builder itself still runs free in your browser.

The [Shift Roster Builder](../../ventures/shift-roster-builder/) has a team
page you can host yourself, free, in your own Cloudflare account. Staff open
one link to see their shifts and ask for swaps, cover or time off. What it
couldn't do was record who actually worked. A manager using it still needed
a paper sign-in sheet or a second app for that, and the second app is usually
a paid scheduler. Homebase gives its time clock away for exactly this reason:
the clock is what makes a small team move over.

So the team page now has one.

**For staff** it is two buttons: pick your name, then press Clock in or
Clock out. The time recorded is the server's at the moment you press, not
your phone's, so a phone running slow can't move a punch. Press Clock in
twice and the second one is refused. Clock out when you never clocked in and
you're told to ask your manager. A lunch break is just a clock-out and a
clock-in.

**For the manager** there's a timesheet page for the published week (or any
of the last twelve). It shows each person's hours worked against hours
scheduled. Each stretch of work is matched to the shift it overlaps most, and
flagged when someone:

- started more than five minutes late (the grace is a setting),
- left early, or stayed past the shift's end,
- missed a scheduled shift with no punch,
- worked time on no scheduled shift,
- left a punch unpaired,
- or went over 40 hours in the week.

You can add a missed punch, and it's marked "added by manager" on the page
and in the CSV. The CSV has one line per stretch worked plus a total per
person, ready to copy into payroll.

The fiddly part was time zones. A Worker runs on UTC, but a café's 9 o'clock
shift is 9 o'clock on the café's clock. Punches are stored as instants and
shown in the zone you set (`TIMEZONE=America/Chicago`). The tests check a
Chicago week read in the right zone and in the wrong one, a July date, and
the 01:30 that happens twice when the clocks go back.

What it isn't: proof of presence. There's no geofence, photo or PIN, so
anyone with the team link can punch for anyone. For a ten-person café whose
manager is on the floor, that's how a paper sheet works too. It doesn't
compute overtime pay, meal-break premiums or rounding either, because those
depend on where you are. It shows the hours, and you check them.

It ran on Cloudflare's own runtime locally (`wrangler dev`): a punch shown as
09:01 Chicago time, the double tap refused, and the timesheet and CSV served.
It hasn't been used by a real team yet. If you run a small team and want to
try it, the deploy button is on the
[tool's page](https://marisstella.app/shift-roster-builder/#h-hub).
