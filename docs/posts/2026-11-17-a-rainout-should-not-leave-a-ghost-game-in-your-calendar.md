---
title: "A rained-out game should not leave a ghost in your players' calendars"
seo_title: "Why a re-sent league .ics file leaves old games behind"
date: 2026-11-17
tags: [ventures, league-schedule-generator, calendar]
description: "The league schedule generator's calendar ids now name the fixture, not its date: 1,139 leftover ghost events after rainouts in our test leagues went to 0."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

The [league schedule generator](https://marisstella.app/league-schedule-generator/) has
long moved a rained-out game to the next night both teams are free, and it has long written a
calendar file for each team. Those two features did not get along.

**The problem.** Each game in a calendar file has an id (the `UID` line). A calendar import
adds or updates events by that id; it does not delete events the new file leaves out. Our ids
were built from the game's date and its place on that night. So when a game moved and the
organiser re-sent the file, the moved game came in under a new id, and the old one stayed:
the player saw the game on both nights. Moving or removing one game also renumbered the
others that night, which made duplicates.

**The fix.** Every match now carries a fixture id: the two teams and which meeting of theirs
it is (first leg, second leg). A rainout, a pinned date or a late entrant moves the match
but keeps the id, and the event's `SEQUENCE` counts the moves. When a team withdraws, its
games go out as cancelled events under the same ids, titled "Cancelled: ...", instead of just
disappearing from the file.

**What it changed, measured.** We built 72 leagues (4 to 16 teams, single and double round
robin, four seeds), rained out two random nights, then had one team withdraw, and counted
what a player would see after importing the first file and then the updated one
(`eval/ics-stable-uids.mjs` in the repository):

| | old ids | fixture ids |
|---|---|---|
| after two rainouts (584 team files, 640 games moved) | 1,139 ghost games | 0 |
| after a withdrawal | 512 ghosts, 2,222 duplicates | 0 |
| multi-division example, one night rained out (4 runs) | 52 ghosts, 70 duplicates | 0 |

**Subscribe instead of re-sending.** If you run the
[self-hosted league page](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator#run-your-own-league-page-self-hosted),
players now get a subscribe link (and a Google Calendar link) for their team or for the whole
league. A subscribed calendar re-reads the feed by itself, so a rainout reaches them without
anyone sending anything.

**What we have not checked.** We did not test this in real calendar apps. The counts assume
an import that matches events by id, as the iCalendar standard describes. How Google, Apple
and Outlook each handle a re-imported file or a cancelled event, and how often each re-reads
a subscription, varies, and we have not measured it. Check the dates with your organiser.
