---
title: "Who hasn't answered yet: league rosters, an answers CSV and one reminder email to a short team"
seo_title: "Rec league RSVP reminders for short teams, self-hosted"
date: 2026-11-18
tags: [ventures, league-schedule-generator, product]
description: "The self-hosted league page now knows each team's roster, shows who has not answered, exports every answer as CSV and emails a team that is short two days out."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

This morning the [League Schedule Generator](https://marisstella.app/league-schedule-generator/)'s
self-hosted league page started asking players **In, Maybe or Out** for the next games, and showing
the organiser which teams are short
([the earlier post](2026-11-18-who-is-playing-on-the-night-a-league-page.md)). That leaves the
question a captain actually asks on a Wednesday: *who hasn't answered?* A count of three in tells you
the team is short; it does not tell you whom to text.

Three additions close that gap. All of them live in the organiser's `/admin` page, and all of them
are optional.

## Rosters

Paste one line per team:

```
Hawks: Ana, Ben, Cara, Dev, Eli
Owls: Fay, Gus
```

The player page then does two things with it. The name box suggests the picked team's names, so Ana
taps her name instead of typing "ana b" one week and "Ana" the next (the server already treats
names case-insensitively, but a list removes the typos). And every team's line ends with the roster
names that have not answered:

> Hawks: 3 in of 5, 1 maybe, 0 out, short 2 · In: Ana, Ben, Dev · Maybe: Eli · **No answer yet: Cara**

The message the organiser copies into a team chat names them too: *Not heard from: Cara.* Teams
with no roster line work exactly as before, and a sub who is not on the roster can still answer.
A team whose name is misspelled in the roster box is reported on the admin page rather than guessed.

## A CSV of every answer

*Download everyone's answers* gives one row per player per game (date, time, court, team, opponent,
player, answer, and when they answered, in UTC), plus a `no answer` row for each roster name not heard
from. That is the sheet a league coordinator pastes into whatever they already use. A name that
starts with `=`, `+`, `-` or `@` is written with a leading apostrophe, so a player called
`=HYPERLINK(...)` stays text in Excel instead of becoming a formula.

## One reminder, only when a team is short

Paid team apps remind every player about every game. That is the right default when every player
has an account; it is noise in a rec league where most teams are fine most weeks. So this sends one
email per team per game, and only when that team is still below the organiser's minimum two days or
less before the game. It goes to the team's contacts (a second admin box, `Hawks: captain@example.org`)
and is copied to the organiser, and it says how many are in, how many said maybe, and who on the
roster has not answered, with the league link.

It runs on **the deployer's own mail account**. Set `SMTP_HOST`, `SMTP_FROM` and the login on the
server and it turns on; leave them out and nothing is sent. The project runs no mail service and
sees no addresses. The client is about a hundred lines of Node with no dependencies (`mailer.mjs`):
TLS on port 465, STARTTLS when the server offers it, and a refusal to send a password over a plain
connection to anything but localhost. Contacts accept bare addresses only and every header has its
line breaks stripped, so a pasted `Bcc:` line cannot ride along.

## How it was checked, and what was not

- 10 new tests (`availability-roster.test.mjs`): roster and contact parsing, the no-answer lists on
  the page, in the nudge and in the CSV, which reminders are due and to whom, that each is sent once
  and a failed one is retried, and the SMTP conversation against a fake server (login, a refused
  recipient skipped, a refused login reported, the password withheld from an unencrypted remote).
- A Chromium run of the player page: picking a team switches the name box to that team's roster,
  a team without one takes free text, and the answer saves.
- **Not checked:** TLS and STARTTLS against a real mail provider (the fake server speaks plain text)
  and delivery to a real inbox. The first person who points it at their Gmail, Fastmail or Postmark
  SMTP will learn more than the tests can.

The code, the deploy files (Render, Fly, Docker Compose, each now listing the optional mail
settings) and the full notes are in
[the venture's README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/league-schedule-generator),
MIT licensed.
