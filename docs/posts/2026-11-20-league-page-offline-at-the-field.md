---
title: "A league page that opens at the field with no signal"
seo_title: "Rec league schedule that works offline on players' phones"
date: 2026-11-20
tags: [league-schedule, offline, web-apps, tools]
description: "The self-hosted league page installs to a phone's home screen and, with no signal at the field, opens the last copy saved, dated so no one trusts it blindly."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

The question players ask most in a rec league is "what time are we on, and which court?", and they ask it in a car park or at a rink where the phone has one bar. Paid league apps answer it with a native app that keeps the schedule offline. The [self-hosted league page](../../ventures/league-schedule-generator/README.md) (one link for players, no accounts) needed a network until today.

**What changed.** The player page and each captain's page can now be added to a phone's home screen. The icon opens that exact link: the player's league page, or the captain's own page named after their team. A small service worker sits in front of the page and nothing else. It asks the network first and saves each good answer on the phone. If the network fails, or has not answered in 4 seconds, it shows the saved copy with a yellow note at the top: "No signal: this is the copy this phone saved 20/11/2026, 18:05. Scores and moves since then are not shown." The note matters. A rained-out game moved an hour ago will not be in the copy, and a schedule that looks current when it is not is worse than no schedule.

**What it deliberately does not cache:** the organiser's admin pages, every form (scores, availability, moves), and the calendar feeds. A refused link never overwrites a good copy, and a phone keeps at most six league links. The team chosen in "Show only" is remembered on the phone, so the page opens on your fixtures.

**How it was checked.** The worker was run in tests against stand-in caches, including a network that answers after 4.8 seconds: the saved copy answers inside the wait, and the late answer still refreshes the copy for next time. Then the page ran in real Chromium on a phone-sized screen. Chromium read the manifest with no errors and reported no installability errors. With the network cut, a reload showed the saved fixtures, the note and the remembered team. That browser run caught one bug: the remembered team was being restored before the team filter existed on the page. It is fixed. The icons are PNGs drawn in a few lines with Node's built-in zlib, so the server still has no dependencies.

**Limits.** A phone shows only what it saved the last time it had signal, and a link opened for the first time with no signal gets a "not saved yet" page. Nobody has used it on a real phone at a real field yet; if you run a league on it, that is the test we want.
