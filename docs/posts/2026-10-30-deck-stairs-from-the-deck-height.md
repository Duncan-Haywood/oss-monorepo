---
title: "A deck's stairs start from one number: how high the deck is"
date: 2026-10-30
tags: [wall-framing-takeoff, decks, stairs]
description: "The wall-framing takeoff now sizes a deck's stair from the deck's own height: a 36 in deck gets five equal risers of 7.2 in."
---

The [wall-framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) already laid out a deck (joists, beam, posts, footings, boards, guard) and, separately, stairs. Until now you had to type the deck's height twice, once for each, and the two could drift apart.

Add `"stairs": {"width": 48}` inside the plan's `deck` object and the stair is built with the deck surface height as its total rise.

**Worked example.** A deck 36 in above grade, with a 7.75 in maximum riser, needs 36 / 7.75 = 4.65, rounded up to 5 risers. The takeoff divides evenly: 5 risers of 7.2 in. Its stringers, treads and hardware join the lumber order like any other stair.

**What is not checked.** The numbers are hand arithmetic against the model code's riser limit; no real permitted deck plan has been run through it, and it is CLI only (no page control yet). Local code governs.
