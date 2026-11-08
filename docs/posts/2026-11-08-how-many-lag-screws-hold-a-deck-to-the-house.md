---
title: "How Many Lag Screws Hold a Deck to the House? A Ledger Check You Can Read"
seo_title: "Deck Ledger Fastener Spacing: Load Per Foot and Lag Screw Count"
date: 2026-11-08
tags: [wall-framing-takeoff, deck, construction]
description: "The deck framing tool now turns joist load into pounds per foot of ledger and compares it with the fastener value you type from the maker's table."
---

Attached decks fail at the ledger more often than anywhere else, so it is the connection worth checking first. The [wall framing takeoff](/ventures/wall-framing-takeoff/) already counted ledger fasteners (two per 16 in) but never asked whether that is enough. The new `deck.ledgerCheck` does.

The arithmetic is the joist's house-side reaction. For a joist of span L with a cantilever c past the beam, carrying (dead + live) psf, the ledger gets (L² − c²) / 2L of tributary width. On the 16 by 12 ft sample deck at 10 + 40 psf that is 270 lb per foot of ledger.

You then type one fastener's allowable lateral value in pounds, read from the maker's table for your rim and ledger. At 300 lb each, the check says one fastener per 13.4 in at most, 15 for the 16 ft ledger, against the 24 the plan carries, so it passes. At 100 lb each it fails. A freestanding deck is refused, since it has no ledger on the house.

Nothing is shipped: no capacity table is built in. Withdrawal, the house rim's own strength, flashing and lateral-load connectors are not checked, and no real permit set has been run through it. It is hand-arithmetic tested in `deck.test.mjs`. Treat it as a way to catch a short count before you ask your engineer.
