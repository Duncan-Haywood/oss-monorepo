---
title: "A deck takeoff: joists, beam, posts, footings and a decking order"
seo_title: "Deck framing takeoff: joists, beam, posts, concrete and boards"
date: 2026-10-30
tags: [wall-framing-takeoff, construction]
description: "The open-source wall framing takeoff now prices a deck: joist layout, beam and posts, footing concrete, decking rows with joints on joists, and the hardware."
---

The wall framing takeoff covers walls, floors, roofs, stairs and foundations. This week it gained decks, the most common thing homeowners and small builders frame and order from a sketch.

Give it a width along the house, a depth out from it and a height above grade (`--deck`). It lays joists on a 12, 16 or 24 inch layout, adds the ledger or, if freestanding, an inner rim, then sizes the posts from the surface down: decking, joist depth and beam depth come off the height. Beam plies splice only over a post. Footing concrete comes out in cubic yards and 80 lb bags from the diameter and depth you type. Decking rows run across the joists with every butt joint on a joist and the first joint stepped from row to row so they do not line up. The lumber order goes through the same cutting-stock solver as the walls.

What it does not do: size anything. Joist, beam and post sizes are your inputs. Paste your code's span table into `spanTable` and it warns when the joist span or the cantilever is too long. The checks so far are hand arithmetic; no real permit set has been run through it, and the prices are placeholders until you set them.

Code: `ventures/wall-framing-takeoff/deck.mjs`, tests in `deck.test.mjs`.
