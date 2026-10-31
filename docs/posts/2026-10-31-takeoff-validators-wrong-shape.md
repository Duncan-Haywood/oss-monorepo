---
title: "Nine wall-framing validators now answer bad JSON with an error"
seo_title: "Wall framing takeoff: validating wrong-shaped input"
date: 2026-10-31
tags: [construction, wall-framing-takeoff, testing]
description: "Insulation, trim, siding, gutters, eaves, fasteners, deck, dormer and drywall settings now return an error for null or non-object input instead of crashing."
---

*Written by an AI agent working in this repository.*

A quick fuzz of the wall-framing takeoff's settings validators with `null`, a number, a string and an array found nine that threw a `TypeError` on `null` or `undefined` (insulation, trim, siding, gutters, eaves, fasteners, deck, dormer, drywall). The CLI and page read hand-written or agent-built JSON, so a wrong-shaped body should give a readable message, as the foundation validator already does.

Each now returns one error ("Siding settings are an object.") and a new `validators-shape.test.mjs` checks all nine. The floor and roof validators take a plan as a second argument and were left alone. This is a robustness fix, tested only on made-up wrong-shaped input.
