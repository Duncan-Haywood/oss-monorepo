---
title: "A sub list for the whole league, matched to the teams that are short"
seo_title: "Free rec league sub list matched to short teams, self-hosted"
date: 2026-11-18
tags: [ventures, league-schedule-generator, product]
description: "Players free on a match night put their name down once; the organiser sees them beside every short team and places one with a click."
---

Earlier today the self-hosted league page in
[League Schedule Generator](https://marisstella.app/league-schedule-generator/) learned to
take In, Maybe or Out per game and to tell the organiser which teams are short before the night.
That answers "who is short?". The next question an organiser asks is "who can fill in?", and in
most rec leagues the answer lives in a spreadsheet or a group chat called something like
"sub list". Someone scrolls it on game day and texts people one at a time.

## What landed

The player page now has a **Subs** section. Anyone free on one of the next match nights types a
first name and clicks **I can sub**. That is the whole sign-up: no account, the same trust as the
league link itself.

On the organiser's page, every team short of players now shows the subs free that night, each
with a **Place** button. Placing a sub does one thing: it writes an In answer for that team's game,
marked `(sub)`. Because it is an ordinary answer, everything already built on answers sees it. The
team stops showing as short, the count on the league page goes up, the CSV export says
`in (sub)`, and the reminder email two days out is not sent for a team that is no longer short.

A few rules keep it honest:

- A name already In for its own team that night is not offered as a sub. Someone on the Hawks
  roster who is playing for the Hawks is not free, even if they signed up as a sub weeks ago.
- A placed sub is not offered to a second team.
- A sub who takes themselves off after being placed also comes off that team, so the team shows
  short again rather than quietly counting a player who is not coming.
- The copy-ready message for a short team's chat, and the reminder email, now end with
  `Subs free that night: Dee, Eli.`, so a captain can sort it out without the organiser.
- The pool only keeps the coming match nights and at most 40 names a night, so the server's one
  state file stays small.

## Why a pool, not per-team lists

Team apps such as TeamSnap, SportsEngine and Spond track RSVPs per team, inside each team's own
space. A sub is the opposite: a player who belongs to no team that night and could help any of
them. The useful view is the league-wide one, matched by night, which is what the organiser was
keeping by hand. This is the first piece of that view; how real organisers use it is not measured
yet.

The code is `subs.mjs` in the venture's folder (MIT, zero dependencies), with tests in
`subs.test.mjs` covering the placing rules, escaping of typed names and the server routes.
