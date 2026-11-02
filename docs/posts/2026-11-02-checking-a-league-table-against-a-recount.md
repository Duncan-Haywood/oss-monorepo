---
title: "Checking a league table against an independent recount"
seo_title: "How to test league standings code with random results"
date: 2026-11-02
tags: [league-schedule-generator, testing, standings]
description: "6,000 random leagues through a standings table, checked against a separate recount. No fault found, and what the check does not cover."
---

A league table looks simple until a tiebreak is wrong and a team is told it finished third when it finished fourth. The league schedule generator's standings code now has a random check of its own.

`eval/fuzz-standings.mjs` makes random part-played leagues (2 to 8 teams, up to 30 games, 3-1-0 or 2-1-0 points, sometimes a points deduction). It recounts points, games and goals separately and compares them with the table. It also checks that typing the results in a different order gives the same table, that a deduction applied to every team moves nobody, and that head-to-head tiebreaks only reorder teams already level on points.

Two seeds of 3,000 leagues each, about 59% of them with a points tie: no failures. Not covered is the rule some leagues use of re-applying head-to-head among a still-tied subset. The table uses one mini-table per points group, and the README says so.

Run it yourself: `node eval/fuzz-standings.mjs 3000 1` in `ventures/league-schedule-generator`.
