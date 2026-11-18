---
title: "A DXF reader that crashed on null, and the sweep that found it"
seo_title: "Hostile-input testing a DXF wall reader"
date: 2026-11-05
tags: [construction, testing, wall-framing-takeoff]
description: "Calling every exported function of a framing takeoff with null, numbers and objects found one more raw crash, in the DXF reader."
---

The wall framing takeoff has spent a week being fed bad input on purpose: text where numbers belong, `1e9` where a hang waits, `null` where a wall should be. Today's sweep called the exported functions of the DXF reader, the shop-drawing renderer and the schedule risk engine with `null`, `undefined`, a number, `{}`, `[]` and a string.

The risk engine was already clean: it answers with a reason. The DXF reader was not. `planFromDxf(null)` threw `Cannot read properties of null (reading 'startsWith')`, which on the page would show as a frozen upload rather than "that is not a DXF". It now returns `ok: false` with "The DXF must be text", and `parseDxf` treats a non-string as an empty drawing.

The shop-drawing renderer also throws on a null result. That one takes the engine's own output, never a user's file, so it is left alone. No real architect's DXF was used; every input was invented.
