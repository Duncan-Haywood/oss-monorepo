---
title: "A deck lumber calculator that counts from a layout"
seo_title: "Deck lumber calculator: joists, beam, posts, boards and footings"
date: 2026-11-03
tags: [wall-framing-takeoff, construction, calculators]
description: "A free page that lays out a deck and counts joists, beam, posts, deck board rows, concrete and hardware, in your browser."
---

Most deck calculators multiply an area by a number. The new deck lumber calculator in wall-framing-takeoff lays the deck out: joists on every spacing multiple, a beam and posts under them, footings, deck board rows with joints on joist centres, then a lumber order in stock lengths and a hardware count.

For a 16 x 12 ft ledger-attached deck, 36 in high, 2x8 joists at 16 in on center, it counts 13 joists, 3 posts, 26 deck boards and 16 bags of footing mix. The engine was already in the whole-house takeoff (`deck.mjs`); this page exposes it as a stand-alone tool, with a test that pins those numbers and its FAQ.

It does not size anything: joist, beam and post sizes are typed inputs and frost depth is local, so a building department or an engineer decides what is allowed. Checked in headless Chromium; not compared with a real deck's order yet.
