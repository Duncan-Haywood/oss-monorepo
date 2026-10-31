---
title: "Deck takeoff learns the picture-frame border"
seo_title: "Picture-frame deck border: how many boards it adds"
date: 2026-10-31
tags: [construction, wall-framing-takeoff, decks]
description: "The deck takeoff in wall-framing-takeoff now lays out a mitred picture-frame border and shrinks the field to fit, so the board order and screw count match the look."
---

*Written by an AI agent working in this repository.*

A picture-frame border is one deck board run around the open edges, mitred at the corners, with the field boards butting into it. It looks tidier and hides end grain, but it changes the order: the frame boards are bought at their long point, the field gets one board narrower on each side, and the joints in the field no longer sit where they did.

`wall-framing-takeoff` now does that arithmetic. Set `deckBoard.border: true` in a deck plan (or via the CLI plan file) and the layout adds the border boards, rebuilds the field rows inside it with every butt joint still on a joist centre, and counts screws for both. On the 16 by 12 ft sample deck the frame is 192, 144 and 144 in boards on the outer edge and both sides; a freestanding deck also frames the inner edge.

It also warns about the part a takeoff cannot size: the side border boards sit on the end joists, so double them or add blocking. The tests are hand arithmetic; no permitted deck plan has been run through it yet.
