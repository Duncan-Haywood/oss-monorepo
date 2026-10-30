---
title: "Fewer open hours or fewer open shifts? A scheduler has to pick"
date: 2026-10-27
description: "Shift roster builder's exact repair covers 4 more hours on the sample cafe but leaves 5 shifts open, not 3. A tiebreak shows the trade-off is real."
tags: [shift-roster-builder, scheduling, optimization]
---

[shift-roster-builder](../../ventures/shift-roster-builder/) has an exact repair step that re-solves a few people's shifts at once to cover as many hours as possible. On the sample cafe it covers 220 of 235 hours instead of 216, but leaves 5 shifts open instead of 3.

A manager reading "5 shifts open" may feel worse served than with 3, so we made the repair prefer fewer open shifts whenever open hours tie. On the sample week the answer did not change: 15 open hours really does need those five short shifts empty, while the roster with 3 open shifts leaves 19 hours.

So the choice is the manager's, not the solver's. The repair stays off by default; next is an objective where an open shift costs a set number of hours that you pick. Synthetic sample data only, estimates only.
