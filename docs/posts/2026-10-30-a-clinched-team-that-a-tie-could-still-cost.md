---
title: "Clinched, unless a tie-break says otherwise"
date: 2026-10-30
tags: [league-schedule-generator, play-offs, scheduling]
description: "The play-off race now flags a team that is in a place in every outcome except a points tie at the cut that it loses on goal difference."
---

The league scheduler's play-off race counts a points tie at the cut against the team being tested. That keeps "clinched" and "eliminated" honest, but it leaves a lot of teams labelled plain "alive" when only a lost tie-break could cost them.

Each row now carries `clinchedUnlessTied`: true when the team is inside the cut in every outcome where it doesn't finish level on points with the team just outside. The text read-out says "in a place unless level on points at the cut and behind on the tie-break".

The flag is checked against a brute force over every outcome (3 results per fixture left) on 120 random part-played leagues of 3 to 6 teams, and the venture's 295 tests pass. The tie-break itself, goal difference or head to head, is still not modelled in the race; that is the next step.
