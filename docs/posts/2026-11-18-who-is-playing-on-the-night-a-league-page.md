---
title: "Who's playing on the night: availability and short-handed teams on a self-hosted league page"
seo_title: "Free player availability (RSVP) for a rec league, self-hosted"
date: 2026-11-18
tags: [ventures, league-schedule-generator, product]
description: "The league page players already open now takes In, Maybe or Out per game and tells the organiser which teams are short of players before the night."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

Most forfeits in a rec league are not a surprise to anyone but the organiser. The team captain has
known since Monday that four people are away; the organiser finds out at the court. Paid team apps
fix this with RSVPs tied to player accounts. TeamSnap, SportsEngine and Spond all do it, per team,
with every player signed up. A group-chat poll is the free version, and it shows one team and one
game, with no idea how many players that team needs.

The [League Schedule Generator](https://marisstella.app/league-schedule-generator/) already ships a
self-hosted league page (`server.mjs`): one private link where players see every fixture, the
table, and a calendar feed that follows rainouts. Today that page also asks **who's playing**.

## What a player sees

Under the fixtures, the page lists the games on the next two match days. Each team has a line:

```
Lob Squad: 5 in of 7, 1 maybe, 2 out  short 2 · In: Ana, Ben, Cara, Dev, Eli · Maybe: Fin · Out: Gus, Hal
```

One form takes an answer: pick the game and your team, type a first name, choose In, Maybe or Out.
Answering again with the same name, in any case, changes the answer rather than adding a second
one. There are no accounts. Anyone holding the league link can answer, the same trust the link
already carries for the fixtures and the score form.

## What the organiser sees

The admin page has one new number: **players a team needs on the night**. Set it to 7 and the admin
page lists every team below 7 for the next games, biggest gap first, each with a message ready to
paste into that team's chat:

```
Lob Squad: 5 of 7 players are in for Tue 20 Oct 2026 19:00 v Owls. 1 said maybe: can you confirm?
Answer on the league page, or find a sub, so the game is not forfeited.
```

Leave the number at 0 and nothing is flagged; the counts still show on the player page.

## Three design choices

- **Answers belong to the fixture, not the date.** Every game carries a fixture id that survives
  rainouts (the same id the calendar feed uses so a moved game updates in place). When a game is
  rained out and moves a week later, the answers move with it. A test rains out a game with one
  answer on it and finds the answer on the new date.
- **The store prunes itself.** Answers for games that are no longer coming up are dropped on every
  write, and a team takes at most 60 names a game. The state file holds the next two nights, not a
  season of history.
- **Nothing free-form but the name.** The game and team come from a list the server built; a pick
  that names a team not in that game, or a game not coming up, is refused. Names are trimmed, capped
  at 40 characters and escaped everywhere they are shown.

## What it is not

It is not a roster system. It does not know who is on which team, so a player could answer for the
wrong one, and it sends no reminders: the organiser copies the nudge into the chat they already use.
Those are the parts the paid apps charge for, and the README says to use one of them if you need it.
What this adds is the per-game count, across the whole league, with nothing but a name.

The code is `availability.mjs` in the venture, with nine tests in `availability.test.mjs`, two of
which boot the server and post answers through it. It deploys the same way as before: Docker, Fly
or Render from your own fork, on your own account.
