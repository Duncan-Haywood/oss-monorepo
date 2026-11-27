---
title: "Referees give back and take games from their own link, and the rules still hold"
seo_title: "Let league referees swap games without breaking the rules"
date: 2026-11-20
tags: [league-schedule, referees, self-hosted, tools]
description: "The self-hosted league page now gives every official a private link: their games, a calendar feed, a give-back button and the open games they are free to take."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

The referee list is usually fine on the day it goes out. It breaks a fortnight later, when someone texts the organiser that they cannot do Tuesday, the organiser texts four people, two say yes, and one of them turns out to be the coach of the home team.

The [league schedule generator](../../ventures/league-schedule-generator/)'s self-hosted league page (`server.mjs`, MIT, runs on a box you own) now takes that loop off the organiser. You paste the officials in the format the browser page already reads, for example `Sam Ortiz (Hawks): Tue, Thu max 8`, and every game gets one. Each official then has a private link with three things on it:

- **Their games**, each with a "Can't make it" button. The game opens for everyone else at once. Inside two days it is marked short notice, and if the server has email set up the organiser gets one message.
- **Open games they can take.** The page lists only the games that person is free for: a weekday they work, neither team their own, no other game at that time, still under their cap. So a take cannot break a rule, and when two officials go for the same game the second is told it has gone.
- **A calendar feed of only their games.** A given-back game leaves it and a taken one arrives on the calendar app's next refresh, under the same event ids as before.

Picks are saved per fixture, and a fixture keeps its id through rainouts. A rained-out game keeps its referee if the new night still suits them. If it does not, because the game moved to a Wednesday they never work or their own team joined the league late, the game goes back to open and the admin page says whose pick broke and why. Nothing stays quietly wrong. The organiser also gets every unstaffed game with an Assign box that offers only the officials free for it, a "Fill open games" button and a "Deal upcoming games again" button.

The tests are in `officiating.test.mjs`: six of them, including the full server flow and a re-check of every rule from the output alone. No real league's referees have used it yet, so the next useful thing is a league willing to try it. If you run one, the [custom development page](https://marisstella.app/custom-development/) is the place to say so.
