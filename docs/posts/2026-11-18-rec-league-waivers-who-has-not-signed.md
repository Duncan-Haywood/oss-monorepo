---
title: "Rec league waivers: the hard part is who has not signed, so the league page now lists them"
seo_title: "Free player waivers for a rec league, with who has not signed"
date: 2026-11-18
tags: [league-schedule-generator, sports, product]
description: "The self-hosted league page now takes player waivers: your own text, versioned by hash, guardians for minors, and each team's unsigned players listed."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

Most rec leagues ask every player to agree to a waiver or a code of conduct before they play. Collecting the signatures is easy. The paper sheet at week one, a form tool, a waiver app or a league platform all do that part. The chore is the night before the first game: matching a pile of signatures to eight rosters and working out who on each team still has not signed.

The [League Schedule Generator](https://marisstella.app/league-schedule-generator/)'s self-hosted league page now does that part. The page is one small Node server, MIT licensed, that an organiser runs on their own Fly, Render or Docker box. It already handled fixtures, the table, calendar feeds, captain score reports and team sign-ups. Waivers were the one gap its README named against the paid league platforms.

## How it works

- **The organiser pastes their own text** under Waiver in `/admin`. The page does not write a waiver. The words should come from the league's insurer, governing body or a lawyer.
- **Players sign from the league link.** They give their team, their full name and an optional email, tick that they have read the text and agree, and type their full name again as the signature. If the player is a minor, the parent or guardian signs with their own name.
- **Captains sign on the team sign-up form** when a waiver is set, so a team never arrives for approval with an unsigned captain.
- **`/admin` matches signatures to rosters** and lists, per team, who has signed, who signed an earlier version and who has not. A captain's own page shows the same list for their team, so captains can chase their own players.
- **The record is a CSV**: time, team, name, guardian, email, version, whether that version is current, and where the person signed.

## Every signature points at exact words

Organisers edit waivers. A season's text gains a line about alcohol at the venue, or a new insurer's wording. If the record says only "Ben signed the waiver", nobody can later say which words Ben agreed to.

So each distinct text is a version. The version's name is the first 16 hex characters of the SHA-256 of the cleaned text, and the page keeps that text with the date it was first set. A signature stores the version it agreed to. After an edit, Ben shows as "signed an earlier version" until he signs again, and `/admin/waiver.txt?v=<id>` returns the old text exactly as it stood. Old versions nobody signed are dropped after twenty, so the state file stays small.

## Matching names without guessing

Rosters in rec leagues are often first names only ("Hawks: Ben, Cara, Dev"), but signatures are full names. A first-name roster entry matches a signature from the same team that starts with that name, but only when one person on the team has it. If Ben Ong and Ben Ali both sign and the roster says "Ben", neither is matched. The organiser sees "not signed: Ben" plus two unmatched signatures, and fixes the roster. A wrong "signed" would be worse than an honest "not sure".

## What it is not

It records who agreed to text the organiser wrote, and when. It does not draft legal text, check identity, take a drawn signature, keep IP addresses or say whether a release holds. That, and the age at which a player can sign for themselves, depends on where the league plays. A league that needs ID checks or a vendor to stand behind the record should use a paid waiver service.

Eight tests in `waivers.test.mjs` cover versions, signatures, roster matching, the version cap and the whole server flow. A page test recomputes the [guide](https://marisstella.app/league-schedule-generator/how-to-collect-player-waivers-for-a-rec-league.html)'s worked example from the same code. No real league has used the feature yet. That reading is the next step.
