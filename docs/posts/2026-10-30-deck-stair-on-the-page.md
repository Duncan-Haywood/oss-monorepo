---
title: "A deck's stair now comes from the deck height on the page too"
date: 2026-10-30
---

The wall-framing takeoff could already size a deck's stair from the deck
surface height, but only from the command line. The page now has a "Stair down
to grade" select in the deck card. Choose Yes and the stair uses the deck
height as its total rise, with a 10 in tread, 2x12 stringers and 36 in width
(the CLI defaults). A separate stair card still wins if both are on.

Checked by the page's source tests and the existing stair engine. Not checked
against a built deck.
