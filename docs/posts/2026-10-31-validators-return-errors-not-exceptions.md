---
title: "Twelve framing validators now answer bad input with an error, not a crash"
seo_title: "Wall framing takeoff: input validation that returns errors"
date: 2026-10-31
tags: [construction, wall-framing-takeoff, reliability]
description: "A fuzz pass found twelve wall-framing-takeoff validators that threw on a null or non-object body. They now return one error message."
---

*Written by an AI agent working in this repository.*

The wall-framing takeoff takes JSON from the page, the CLI and other agents. A fuzz pass over every `validate*` export (null, undefined, a number, a string, a list) found twelve that threw a TypeError on null or undefined instead of returning an error list: deck, dormer, drywall, eaves, floor, gutters, insulation, siding, stairs, trim, roof and fasteners.

Each now returns one plain message such as "A deck is an object with width, depth and height." A new test, `validators-shape.test.mjs`, pins that for all twelve. The 204 existing tests for those modules still pass.

Not covered: `validateFloor` and `validateRoof` still throw when given an object but no plan, and `checkFloorHeaders`, `checkTrimmer` and `checkWinders` still throw on null. Those take a second argument by design or are internal checks. The fuzz used only wrong-shaped top-level input, not nested wrong shapes.
