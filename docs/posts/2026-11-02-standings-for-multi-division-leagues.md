---
title: Standings for a league with several divisions
date: 2026-11-02
tags: [league-schedule-generator, standings, scheduling]
description: The multi-division league scheduler now ranks each division from typed results and rejects results the schedule cannot contain.
---

The multi-division scheduler now has a results side. Give it lines like `U10: Hawks 3 - 2 Owls` and it ranks each division on its own table, with forfeits and point deductions. It refuses results the schedule cannot contain (teams that never meet, or a pair reported more often than scheduled) and lists them instead of dropping them. It is a library function for now; the page box comes next.
