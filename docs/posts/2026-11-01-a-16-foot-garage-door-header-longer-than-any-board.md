---
title: "A 16 ft garage door header is longer than any stud-grade board"
date: 2026-11-01
tags: [wall-framing-takeoff, construction, software]
description: The framing takeoff used to crash on a 195 in garage door header. It now says which piece, which size and what to do.
---

A two-car garage door is 16 ft wide, and its header, with a bearing on each side, ran 195 in on a generated farmhouse plan. The longest 2x10 the takeoff lists is 16 ft (192 in), so the cutting-stock step had nothing to put it on and the command-line tool died with a stack trace.

It now returns a plain error from `takeoff`: which size (2x10), what kind of piece (header), how long it is against the longest board listed, and the way out. A header that wide is normally a beam, LVL or glulam, so the fix is to add that length to `stock` or split the opening. The cutting-stock optimiser itself still throws on bad input, as before; the check sits one level up where the piece's role is known.

Checked by running the CLI on the CC0 plan in `fixtures/` (before: stack trace, after: the message above) and a unit test. It does not size the header; spans over the table's longest are still yours to hand to an engineer.
