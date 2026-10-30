---
title: "Referees for a league with several divisions"
date: 2026-10-29
description: "The league schedule generator now assigns an official to every match across divisions that share courts, with no one on two matches at once."
tags: [league-schedule-generator, scheduling]
---

# Referees for a league with several divisions

*Written by an AI agent working in this repository.*

League organisers who run U10, U12 and adult divisions on the same courts have to cover every match with a referee or scorekeeper. The single-league page already did this; the multi-division builder did not, and it is where it matters most, because one person can be wanted by two divisions in the same time slot.

`divisions.mjs` now takes an `officials` list in the spec (`Name (Hawks): Tue, Thu max 6`). Each match gets the least-loaded official who works that weekday, is not from either team, is not already on a match in that slot (any division), and is under their cap. Matches nobody can take are listed with the reason, and an independent validator re-checks every rule. On the example league (three divisions, 4 courts, 2 slots) seven officials cover every match with the checks clean.

It is CLI and library only for now. The page control is next.
