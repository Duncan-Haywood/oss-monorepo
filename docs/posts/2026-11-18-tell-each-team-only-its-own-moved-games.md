---
title: "Tell each team only its own moved games: schedule-change emails for a self-hosted league"
seo_title: "Email rec league teams when the schedule changes, self-hosted"
date: 2026-11-18
tags: [ventures, league-schedule-generator, product]
description: "Saving a rainout or withdrawal on the self-hosted league page can now email each affected team one list of only its own moved, cancelled or added games."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

A rainout in a rec league is a ten-minute fix for the organiser and an hour of confusion for everyone
else. The schedule gets moved, the new sheet goes to the group chat, and every captain has to scan the
whole season to find out whether their own Tuesday changed. Somebody always misses it and turns up to an
empty court.

The [League Schedule Generator](https://marisstella.app/league-schedule-generator/) already keeps the
damage small: a rainout moves only the games that were rained out, and every game keeps the same calendar
id all season, so a subscribed calendar updates instead of duplicating. What it did not do was tell the
teams. Today's change closes that gap on the self-hosted league page (`server.mjs`).

## What happens on save

When the organiser saves a league that is already published, the server builds the season twice, as it
was and as it is now, and compares them fixture by fixture. Every match carries a fixed id (the pair of
teams and which meeting it is), so the comparison does not care *why* things changed: a rainout line, a
withdrawal, a late team, a new court or a hand edit to the time slots all come out the same way, as a
list of upcoming games that moved, were cancelled or were added. Games already played are ignored.

The admin page then says what the save did, for example *5 upcoming games changed for 6 teams (Hawks,
Owls, ...)*. If the organiser ticked **Email teams whose upcoming games this save moves**, each affected
team gets one email at its contact addresses, with the organiser copied, listing only its own games and
from its own side:

```
Hi Hawks, the organiser changed 2 of your games:
- vs Owls (home): was Tue 13 Oct 2026 18:00, Court 1, now Tue 27 Oct 2026 19:00, Court 2
- at Kites (away): Tue 3 Nov 2026 is cancelled
Your other games are unchanged.
```

A team with no contact address is named in the admin note so the organiser can tell it by hand. A second
save that changes nothing sends nothing. Mail goes out on the league's own SMTP account, the same one the
short-team reminders use; without it the summary still shows and no email is sent.

## Why not just email everyone the new schedule

Because people stop reading. The paid platforms (TeamSnap, LeagueApps, SportsEngine) do send change
notifications, to every player account, on paid plans. The free alternative, re-sending the sheet,
puts the diff on every reader. A list of only your own changes, with "your other games are unchanged"
at the bottom, is the message a captain can act on in five seconds.

## How it was checked

`changes.test.mjs` builds seasons by hand and checks moved, cancelled and added fixtures, that past games
are never reported, that each email holds only its team's games, that a long list is cut at 40 with a
pointer to the page, and that inherited object keys are never read as contacts. Two end-to-end tests run
the real server with a fake mailer: a rainout on the first night of the sample league emails exactly the
teams that played that night (minus the one with no address, which the note names), unticked sends
nothing, SMTP off sends nothing, and a repeat save sends nothing more. Not checked: delivery to a real
inbox through a real provider.

The code is MIT licensed and runs on a box you own; the setup is in the venture's README under
"Run your own league page".
