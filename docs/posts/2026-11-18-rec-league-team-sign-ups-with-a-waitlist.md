---
title: "Team sign-ups for a rec league: a cap, a waitlist and your own payment link, self-hosted"
seo_title: "Free rec league team registration with a waitlist, self-hosted"
date: 2026-11-18
tags: [ventures, league-schedule-generator, product]
description: "A self-hosted league page now takes team sign-ups: one public link, a team cap with a waitlist, a fee on your own payment link, one-click approve."
---

Before a rec league has a schedule it has a sign-up. In most small leagues that is a Google Form and
a Venmo or Stripe payment link in the group chat, and then an evening of copying: each team into the
schedule, each player into a roster, each captain's email into a contact list, and a running count
of how many places are left. The paid route is registration on LeagueApps, SportsEngine or TeamSnap,
which processes cards and waivers too, on a paid plan or a per-transaction fee.

The [League Schedule Generator](https://marisstella.app/league-schedule-generator/)'s self-hosted
league page (`server.mjs`, MIT, one JSON file on a server you own) now does the sign-up as well, the
Google-Form way but with the copying, the cap and the waitlist done for you.

## What a captain sees

The organiser ticks *Open sign-ups* and shares `/register`. The page shows how many places are left
and the fee, if there is one. The captain types the team name, their name and email, an optional
phone number, the players (first names are enough) and a note. Then they see where the team stands,
the fee, the organiser's payment link and the team name to put in the payment's note. With mail set
up on the deployer's own account, a confirmation email goes to the captain, copied to the organiser.

Once the teams listed plus the sign-ups waiting reach the cap, the page says the league is full and
later sign-ups go on a numbered waitlist, with no pay link. An optional closing date shuts the form.

## What the organiser does

Every sign-up waits in `/admin`. **Approve** adds the team to the Teams list, the captain and players
to Rosters and the captain's email to Contacts. Those are the lists the
[availability page](/posts/2026-11-18-who-is-playing-on-the-night-a-league-page/) and the
[short-team reminders](/posts/2026-11-18-league-rosters-and-reminders-for-short-teams/) already read,
so the new team can answer "who's playing" straight away. **Decline** drops it. A *Mark paid* tick per
team, before or after approval, feeds an "approved, fee not marked paid" list, and one CSV holds every
sign-up for the club's records.

## What it does not do

It never touches a card. The fee is paid on the organiser's own Stripe, Square or PayPal link, and the
organiser ticks *Paid* by hand after checking their own account. There is no key to configure and no
payment status to trust. It has no waivers, no age checks and no per-player accounts. A league that
needs those should use a platform and paste the schedule in.

The public page has the limits a page without a secret needs: it is off until the organiser opens it,
it takes five sign-ups per address per hour and 200 waiting at most, and it has a honeypot field. Team
names are limited to what the schedule, the results box and the roster lines can read back, so an
approved team's first result (`Falcons 3 - 2 Owls`) counts in the table.

## How it was checked

`registration.test.mjs` has 11 tests. They cover the name rules, required fields and duplicates, cap
and waitlist order, the closing date, and approve into the three lists with the league still building
and a result for the new team parsed. They also cover the paid tick, the CSV and its spreadsheet
formula guard, the per-address limit, the payment-link filter (only plain `https://` links are shown)
and the confirmation email, plus the whole route through the HTTP server. A run of the real server
signed up a fifth team into a published four-team league, waitlisted a sixth past a cap of five, and
showed the approved team in the published schedule. No real league has used it yet; the first one
that does will tell us what is missing.
