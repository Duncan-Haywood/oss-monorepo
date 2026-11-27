---
title: "Free agents in a rec league: players with no team, placed on the short rosters"
seo_title: "Rec league free agent sign-up and team placement, self-hosted"
date: 2026-11-18
tags: [ventures, league-schedule-generator, product]
description: "A self-hosted league page now takes free-agent sign-ups and suggests a team for each: smallest roster first, experience spread, friends kept together."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

Every adult rec league has players who want in but have no team: someone new in town, a friend of a
friend, a player whose old team folded. Leagues call them free agents. The usual handling is a Google
Form, then the organiser reads the list, looks at which teams are short, guesses who would fit where,
copies each name into a roster and emails two people to introduce them. LeagueApps, SportsEngine and
TeamSnap take free-agent registrations on paid plans, but the assigning is still done by hand.

The [League Schedule Generator](https://marisstella.app/league-schedule-generator/)'s self-hosted
league page (`server.mjs`, MIT, one JSON file on a server you own) now does that part too.

## What a player sees

The organiser ticks *Take free agents* in `/admin` and shares `/join`. The team sign-up page links to
it while it is open. A player types their name, email, an optional phone number, how much they have
played (new, a season or two, experienced), optionally a friend who is also signing up alone, and a
note such as nights they cannot play. That is all: no account.

## What the organiser sees

Each player waits in `/admin` with a team already picked in a drop-down, next to every team's current
roster size. The pick follows three plain rules:

1. **Friends stay together.** A player who names a friend by full name, or by a first name only one
   waiting player has, is grouped with them (at most four). Two waiting players called Sam means no
   guess: the player stands alone and the organiser can move them by hand.
2. **Smallest roster first.** Groups go most experienced first, each to the team with the fewest
   players, counting the Rosters line and the players already suggested in this batch.
3. **Experience spread.** On a tie, the team that has had the least experience from free agents so far
   gets the group, so three experienced players do not all land on one team.

An optional *roster size to fill up to* stops a team being suggested once it is full, and a group that
fits nowhere says so ("no team has room for 2 together"). The organiser clicks **Place** for one
player, with the pick or another team, or **Place all as suggested**.

Placing writes the name into that team's Rosters line, the same line the
[who's-playing counts](/posts/2026-11-18-who-is-playing-on-the-night-a-league-page/), the short-team
reminders and the [waiver list](/posts/2026-11-18-rec-league-waivers-who-has-not-signed/) already
read, so the new player can answer "in" for the next game straight away. With mail set up on the
deployer's own account, the player gets one email with their team, the team's contact address and the
league link, and the team's contacts get the player's name, email, phone, experience and note. A CSV
holds every free agent, placed or waiting, for the club's records.

## What it does not do

It does not rate players or check what they say about their experience; the three levels are what the
player picked. It does not take payment: a free-agent fee is shown as text and paid however the
organiser says. It does not rename anyone, so a second "Ana" on a team's roster is refused until the
organiser adds a last initial. And it has not been used by a real league yet: the checks are tests on
made-up teams (eight of them, through the real HTTP server too), not a season.

The code is `freeagents.mjs` in
[the venture](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator),
with the rules above in its README.
