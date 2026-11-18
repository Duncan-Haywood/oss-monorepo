---
title: "League notices where players already look: a dated message on the schedule page, emailed if you want"
seo_title: "Free league announcements for a rec league, self-hosted"
date: 2026-11-18
tags: [ventures, league-schedule-generator, product]
description: "The self-hosted league page now carries organiser notices: for everyone or one team, with an end date, optionally emailed to each team's contacts."
---

Every rec league organiser sends the same messages each season: courts 3 and 4 are closed on Tuesday,
fees are due by Friday, play-offs start on the 12th. They go out on a group chat or a mass email, and
then they are gone: a player who joined late never saw them, and nobody can find the one about the
play-off format a month later. Paid league apps (TeamSnap, LeagueApps, SportsEngine) solve it with
messaging tied to an account for every player.

The [League Schedule Generator](https://marisstella.app/league-schedule-generator/) already ships a
self-hosted league page: one private link with every fixture, the table, calendar feeds, captain score
reports and move requests. As of today the organiser can also post **notices** on it.

## How it works

In `/admin` there is a Notices form with three choices:

- **Who sees it.** Everyone (it shows under "From the organiser" at the top of the league page) or one
  team (it shows only on that team's captain page, so "your fee is still due" is not posted in public).
- **Show until.** A date; leave it blank and the notice stays two weeks. Old news drops off by itself.
- **Also email it.** With the organiser's own SMTP account set up, each team's contacts get one email
  with the notice and the plain league link. The confirmation names any team with no contact address,
  so the organiser knows who to tell by hand.

Notices are plain text, escaped, with line breaks kept; `https://` links (a payment page, a map)
become clickable and nothing else does. A shared email never carries a captain link, since anyone
holding one can report scores for that team.

## What it is not

It is a notice board, not a chat: players do not reply on the page, and there is no read tracking.
The league page also has no accounts, so a team notice is as private as that team's captain link.
Six tests cover the input checks, the audience and end-date rules, escaping, the per-team emails and
the full post-see-remove flow through the server. No real league has used it yet.

The code is MIT, zero dependencies, and runs on a box you own: `ventures/league-schedule-generator/`
(`announcements.mjs`, README "Notices from the organiser").
