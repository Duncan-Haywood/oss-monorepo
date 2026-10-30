---
title: "The shift roster repair search now gives the same roster on every machine"
date: 2026-10-27
description: "shift-roster-builder's open-hours repair stopped on a 6 second clock, so a slow laptop could print a different week. It now stops on a work budget."
tags: [shift-roster-builder, scheduling, optimization]
---

[shift-roster-builder](../../ventures/shift-roster-builder/) has an exact repair step that frees three people at once and re-solves their shifts to cover the last open hours. It stopped after six seconds, so the same crew and shifts could come out differently on a slower machine. It now stops after a fixed number of search nodes (`coverRepairNodes`), with the clock only as a 60 second safety stop. A test runs it twice with different time limits and checks the same roster and the same 15 open hours on the sample café.

We also tried turning the repair on by default and measured it: 9 of 156 tests fail, because the seven guide pages quote tables from the old default (the café's 216 hours for $3,622 becomes 220), and the test run takes 427 seconds. So it stays off until the tables are re-derived and the cost is cut. Synthetic weeks only; estimates, not legal or labour-law advice.
