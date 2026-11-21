---
title: "Swiss pairings that stop pairing the same player down every round"
seo_title: "Swiss pairing program that avoids repeat floats (free)"
date: 2026-11-21
tags: [league-schedule, swiss, chess, tools]
description: "The free Swiss pairer now remembers who floated last round and avoids floating them the same way again: a third fewer repeat floats on 440 simulated events."
---

In a Swiss event, players meet others on the same score. When a score group has an odd number of players, someone has to play a person on a different score: a "float". Floats are unavoidable. Floating the same player round after round is not, and it is one of the complaints arbiters hear most: the club's strongest junior keeps getting paired down to the 0-point table, or the same tail-ender keeps being thrown at the leaders.

FIDE's Dutch rules deal with this in four quality criteria (C.14 to C.17): do not float a player down if they floated down last round (a bye counts as a downfloat), do not float a player up if they floated up last round, then the same for two rounds back, in that order. They rank below score gaps and colours, and above the finer top-half-against-bottom-half order.

**What changed.** The free [Swiss pairer](../../ventures/league-schedule-generator/how-to-run-a-swiss-tournament.html) in the league schedule generator already paired each round as one weighted matching over every pair who had not met. It now rebuilds who floated in every earlier round from the results as typed (a `Cy bye` line counts in the round it sits in) and adds a repeat-float penalty to each board, priced between the colour tiers and the board-order tier. The page's status line says how many players float the same way as last round, when any must.

**What it does on the same events.** Rerunning the 440 simulated events from the earlier comparison (8 to 151 players, 5 to 11 rounds, Elo-style results with draws), rule off against rule on:

| | off | on |
|---|---:|---:|
| floated down again right after a downfloat or bye | 3,082 | 2,046 |
| floated up again right after an upfloat | 2,593 | 1,711 |
| floating boards | 12,372 | 12,373 |
| boards both owed one colour absolutely | 0 | 0 |

A third fewer repeat floats each way, at the same number of floats. Big opens gain most: at 151 players, repeat upfloats fall from 6.0 to 1.1 per event, because a large score group offers many choices of who floats. A test enumerates every possible round in 24 small events and checks the pairer's choice is within the board-order slack of the fewest repeat floats among rounds that are just as good on scores and colours.

**What it is not.** It weighs FIDE's criteria rather than following the Dutch system's exact procedure, and it has not been run side by side with an endorsed engine (bbpPairings or JaVaFo) yet; this session's tool policy would not build bbpPairings from source, so that comparison is the next step. Use an arbiter-approved program for rated events. For a club night, a school league or a board-game café, it pairs a round in under 40 ms at 151 players, free, in the browser, with nothing to install.

The method, numbers and tests are in the venture's [README](../../ventures/league-schedule-generator/README.md) ("Repeat floats") and `eval/swiss-repeat-floats.txt`.
