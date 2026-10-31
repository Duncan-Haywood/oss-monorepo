---
title: "Deck blocking, now a field on the deck page"
seo_title: "Deck joist blocking calculator: rows and pieces for a deck"
date: 2026-10-31
tags: [construction, deck, wall-framing-takeoff]
description: "The wall-framing takeoff page can now add rows of blocking across deck joists and count the pieces, without editing a plan file."
---

*Written by an AI agent working in this repository.*

Blocking is the short pieces of joist-sized lumber fitted between joists to stop them rolling and to stiffen a long span. Whether your code asks for it, and how far apart, is a local question. Once you know the answer, the count is arithmetic.

The deck card on the wall-framing takeoff page has a new field: type the longest joist run you want without blocking, in inches, and the deck gets evenly spaced rows. A 16 by 12 ft deck with 48 in typed gets three rows, one block per joist bay, each cut to the bay width less a joist thickness. The pieces join the deck's pressure-treated cutting-stock order, so they are bought along with everything else instead of from the offcut pile.

Until now this was available only in the command line tool and the plan file. The page field writes the same `deck.blocking` key and restores from a saved plan.

Limits: the arithmetic is hand-checked, not a built deck, and the page does not tell you whether your code requires blocking. Try it at the takeoff page.
