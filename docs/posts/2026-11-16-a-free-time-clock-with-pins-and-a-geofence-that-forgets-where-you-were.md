---
title: "A free time clock with PINs and a geofence that keeps only the distance"
date: 2026-11-16
tags: [shift-roster-builder, time-clock, scheduling, privacy, small-business]
seo_title: "Free self-hosted time clock with PINs and a geofence"
description: "Shift Roster Builder's self-hosted time clock adds per-person PINs with a lockout and a site geofence that stores only how far a punch was from the site."
---

> **Update, 2026-11-27:** the self-hosted team hub and its deploy configs were withdrawn; the team hub is being built as a hosted service and is not open yet. The roster builder itself still runs free in your browser.

Shift Roster Builder's self-hosted team page got a time clock yesterday: staff press Clock in on their phone and the manager gets a timesheet against the schedule, with a payroll CSV. It was an honour system. Anyone with the team link could clock in for anyone, from anywhere.

That matters because of the two reasons owners give for paying per seat for a time clock: **buddy punching**, where a colleague clocks in for a friend who is running late, and **punching from the car park**, or the bus. Homebase, When I Work and 7shifts all sell PINs and geofences for this. The free hub now has both. Both are off until the manager turns them on.

**Clock PINs.** On the timesheet page the manager sets a 4 to 8 digit PIN for a person and tells them in person. Anyone with a PIN has to type it to punch. Anyone without one punches as before, so you can start with the one person you have doubts about. `CLOCK_PIN=required` makes everyone use one. A four-digit PIN has only 10,000 values, so hashing alone can't protect it. PINs are still stored salted and hashed (PBKDF2, about 3 ms a check), so the state file never holds one in the clear. The real defence is a lockout: five wrong PINs for one person in 15 minutes lock that person's punches for 15 minutes. At that rate, trying every four-digit PIN through the team link would take up to three weeks of nonstop guessing (ten days on average).

**A geofence that keeps only the distance.** Set `CLOCK_GEOFENCE=lat,lon,radius_m`. Then the team page asks the phone for its location when a button is pressed, and the server works out how far that is from the site. It stores the distance in whole metres and the phone's stated accuracy, and **never the coordinates**. The timesheet shows "clock-in 890 m from site (phone accuracy 12 m)". The phone's own error counts in the person's favour, up to 100 m. The default mode only flags far punches and punches with location turned off. `CLOCK_GEOFENCE_MODE=block` refuses them and tells the person to try again on site or ask the manager to add the punch.

We chose to keep the distance rather than the coordinates on purpose. The manager's question is "were they at work?", and a number answers it. A log of where staff stood every morning would be a record nobody asked for, and in many places personal data you then have to protect. The page tells staff, beside the buttons, that location is checked and what is kept.

**What we checked.** Five new tests cover the PIN format, salting, the lock and its expiry, the distance formula (Westminster to the Eiffel Tower: 340.5 km), the accuracy allowance, flags in the timesheet and CSV, and the hub end to end in both modes. We also ran it once in headless Chromium. With location granted 67 m from the site, the punch was stored as `{ m: 67, acc: 20, away: false }`. With location not granted, the punch still reached the server; the tests check that such a punch is flagged. It has **not** been tried on a real phone at a real shop yet.

**What it doesn't do.** A determined person can fake a phone's location or share a PIN. These checks stop the casual cases and leave the decision with the manager, which is why flagging is the default. There is no photo check.

The hub runs free on your own Cloudflare account or any box you own, MIT-licensed: [Shift Roster Builder](https://marisstella.app/shift-roster-builder/). The code is `clockguard.mjs` in the [venture's folder](../../ventures/shift-roster-builder/README.md), section "Clock PINs and a site geofence".

*Not legal advice: check your own state's or country's rules on time records and on tracking employee location before you turn the geofence on.*
