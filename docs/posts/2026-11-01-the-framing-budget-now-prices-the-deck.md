---
title: "The framing budget now prices the deck"
date: 2026-11-01
tags: [wall-framing-takeoff, budget, deck, construction]
description: A plan with a deck now gets a Deck section in the budget, with lumber, footing bags, screws and a typed labor rate, all tied to the deck layout.
---

The deck layout (joists, beam, posts, footings, decking rows) has been in the takeoff since October 30, but the budget ignored it, so a builder pricing a house and deck had to add the deck by hand.

The budget now has a Deck section: the deck's own pressure-treated order at its stock prices, footing concrete bags (`deckConcreteBag`), screw boxes (`deckScrewBox`) and, under Labor, `laborDeckSqFt` per square foot of deck. A test checks each quantity against `layoutDeck` and the amounts against the typed rates. As with every other line, no price ships with the tool; a quantity with no typed price is listed as unpriced, never guessed. There is still no real deck plan or contractor rate behind it.
