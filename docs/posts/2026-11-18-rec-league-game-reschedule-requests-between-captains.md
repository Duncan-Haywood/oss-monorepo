---
title: "Rec league reschedule requests: one captain asks, the other agrees, the organiser clicks once"
seo_title: "Free rec league game reschedule requests between captains"
date: 2026-11-18
tags: [ventures, league-schedule-generator, product]
description: "Captains ask to move a game to a later date, checked against the season at once; the other captain agrees, and the organiser approves with one click."
---

Moving a game is the most common chore in a rec league that is not a score. A captain finds out the
gym is booked, or half the team is at a wedding, and the request starts in a group chat: "can we
play Owls on Thursday instead?" The other captain says yes, the organiser checks whether Thursday is
free for both teams and a court, edits the schedule, and tells everyone. Most of that checking is
mechanical, and the self-hosted league page in
[League Schedule Generator](https://marisstella.app/league-schedule-generator/) now does it.

## What landed

- **Ask from the captain link.** A captain's page (the per-team link from the
  [score confirmation work](2026-11-18-rec-league-scores-confirmed-by-both-captains.md)) now lists the
  team's next twelve games, each with "Ask to move this game": a later date and an optional note.
- **The date is checked before anyone sees it.** The server rebuilds the season with the rainout line
  the organiser would have typed (`2026-10-20 Hawks, Owls -> 2026-10-22`) and keeps the request only
  if the game really lands on that date with nothing else moved: both teams free and not blacked
  out, a court and time slot open, the teams' time and court limits kept. A date that fails is
  refused on the spot with the reason ("cannot play on 2026-10-27"), so the captain tries another
  rather than starting a thread.
- **The other captain answers in the open.** Their own captain link shows "Hawks ask to move it to
  Thu 22 Oct 2026" with the note and two buttons, Agree and Decline. With email set up on the
  organiser's own mail account, that team's contacts get one email with their link.
- **The organiser approves with one click.** An agreed move shows under "Move requests" in the admin
  page. Approve checks the date again against the season as it is now, appends the line to the
  Rainouts box (so the change stays visible and can be edited like any other), and sends both teams
  the usual change email. If the date stopped fitting in between, for example the organiser added a
  blackout, the request closes with the reason and nothing moves.

## Limits, stated plainly

Games only move later, which is the rule the rainout mover already follows. A night when either team
plays twice is refused, because a rainout line names teams, not one game, and would move both. A
request is dropped when its game passes or another edit moves the game. No real league has used it
yet: the checks are nine tests against a made-up six-team league, through the HTTP server.

## Why not just use a league app

TeamSnap and LeagueApps handle reschedules as messages between coaches and an admin who edits the
game by hand, on paid plans. A group chat does the same for free, with no check that the new date
is free. This keeps the free route and adds the check, the other captain's agreement on the record,
and a one-click edit. The code is MIT licensed and runs on a server the league owns.
