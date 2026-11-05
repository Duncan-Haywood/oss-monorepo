---
title: "League scheduler now flags teams that keep forfeiting"
date: 2026-11-05
description: "A small addition to the league schedule generator: the results box counts walkover losses and warns when a team reaches two."
tags: [league-schedule-generator]
---

# League scheduler now flags teams that keep forfeiting

Organisers type forfeits into the results box as `Hawks w/o Owls`. Until now the
table counted them but nothing told you the same team had done it twice.
`forfeitReport` counts walkover losses per team and the page warns when a team
reaches two. Two is only a default; leagues differ on what a forfeit costs, so
the warning says to check your own rule.

Tested on made-up results (229 calc and page tests pass). No real league's
results have been tried yet.
