---
title: "The deck takeoff now lays out the railing on the page"
date: 2026-10-30
tags: [wall-framing-takeoff, deck, takeoff]
description: "A 16 x 12 ft deck 48 in off the ground gets a guard: posts, balusters under a 4 in gap and rails. It was CLI only; now it is two dropdowns."
---

The [wall-framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) already framed decks on its page: joists, beam, posts, footings and decking rows. The guard (railing) was only reachable from the command line. The deck card now has a **Guard** switch (automatic over 30 in above grade, always, or none) and a **Guarded edges** choice (all open edges, outer only, or outer plus the two sides).

Driven in Chromium on a 16 by 12 ft deck at 48 in with the outer edge guarded: 4 posts, 33 balusters of 29 in (clear gap at most 3-11/16 in) and 2 rails of 2x4 pressure-treated joining the lumber order.

What is not checked: the arithmetic is hand-computed, post attachment is yours to detail, and your local code sets the guard height and the gap. No real permitted deck plan has been run through it yet; that is what we want next. Deck stairs are still CLI only.
