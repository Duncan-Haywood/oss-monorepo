---
title: "When two captains want different slots: keeping a league's time requests, and naming the impossible ones"
seo_title: "League schedule with team time requests: what can be kept"
date: 2026-11-18
tags: [ventures, league-schedule-generator, product]
description: "A free league scheduler now keeps every early-slot and court request a night allows, and names the requests no schedule can keep before the season is sent."
---

Every club league organiser collects requests before the season starts. One captain's players
have children, so they want the early slot. Another team needs the lit court. A third works late
and wants 20:00. Each request is reasonable on its own. Together they can be impossible, and the
organiser usually finds out in week five, when the early team and the late team are due to play
each other.

The [league schedule generator](https://marisstella.app/league-schedule-generator/) already took
these requests ("Aces: 18:30" in a time-limits box, "Slice Squad: Court 2" in a court-limits box).
Inside, they were a heavy penalty in the search that shares courts and start times out evenly.
That nearly always kept them, but nothing guaranteed it, and when a set of requests could not all
be kept the page said only that a team "only plays at 20:00, but is at 18:30". It did not say why.

## Two changes

**Kept whenever a night allows it.** After the search, any night that still breaks a request is
solved exactly: matches against open court-and-time slots, as a matching problem. If some
assignment keeps every request, the night gets it. On 300 random leagues (6 to 16 teams, 1 to 3
courts, 1 to 5 random requests) the search alone left a request broken on 1 of 3,033 nights where
it could have been kept. With the exact pass, none.

**Named before the build.** Two kinds of request can never all be kept, and both can be spotted
from the requests alone:

- two teams with no time (or court) in common. They still have to play each other, so one of them
  plays outside its window wherever the match goes;
- more teams limited to some times than those times hold. Two courts at 18:30 hold two matches,
  so five early-only teams cannot all fit on a night when they play other teams.

The page now opens with the conflict and the fix: *Aces only plays at 18:30 and Topspin only at
20:00, so their match breaks one team's time limit wherever it goes. Give one of them a time the
other can play.* That is a conversation with one captain before the season, not an apology email
in the middle of it.

## How well it does

Of the 90 random leagues where some night could not keep every request, the check names 87 before
anything is built. It named no league whose requests could all be kept. The 3 it misses are
crowding that depends on which teams happen to meet on a night. Most of the impossible nights
(139 of 149) came from a pair of teams with nothing in common, which is the case a captain is
most likely to create by accident.

## Try it

There is a new worked example for [tennis leagues](https://marisstella.app/league-schedule-generator/tennis-league-schedule.html):
eight teams on two courts, two early-only teams and a team on one court, every request kept for
seven weeks. A test rebuilds the table from the tool's own code. The method and numbers are in
the project's README ("Time and court limits"), and the measurement script is
`eval/limit-conflicts.mjs` in
[the source](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/league-schedule-generator).
It is free, runs in the browser, and uploads nothing.
