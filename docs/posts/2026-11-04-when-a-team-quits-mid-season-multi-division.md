---
title: "When a team quits mid-season, a multi-division schedule now says who is short"
seo_title: "Handle a team withdrawing from a multi-division league schedule"
date: 2026-11-04
tags: [league-schedule-generator, scheduling, sports-leagues]
description: "The league schedule generator can now drop a withdrawn team from one division, keep played games, and list which opponents lose fixtures."
---

Every volunteer league organiser meets this: week five, a team folds. The
single-division schedule tool already handled it. The multi-division one
(several age groups sharing courts and venues) did not.

It does now. Type `U10/Hawks` to remove all of that team's remaining games, or
`2026-11-03 U10/Hawks` to remove only those on or after that night. Games already
played stay, nothing else moves, and a team called Hawks in another division is left
alone. The note lists each opponent and how many fixtures they lose, because whether
earlier results against a quitter still count is a league rule, not something software
should decide quietly.

On the made-up example league, withdrawing U10/Hawks removes 5 fixtures, one from each
of five opponents, and the schedule still validates (the checker now accepts missing
pairs for a withdrawn team but never extra meetings). Tested on made-up leagues only;
a real league's season is still the open check.

Code and tests: `ventures/league-schedule-generator/` (MIT).
