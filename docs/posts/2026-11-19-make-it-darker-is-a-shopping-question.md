---
title: "\"Make it darker\" is a shopping question: relative colour edits in the clothing studio"
seo_title: "\"Make it darker\": relative colour edits for clothing design"
date: 2026-11-19
tags: [clothing-design-studio, colour, natural-language]
description: "The clothing studio now acts on \"make it darker\" or \"warmer ink\", and says when the shade is not a stock colour. Held out: 13 of 14 first run, 14 of 14."
---

The [clothing design studio](https://marisstella.app/clothing-design-studio/)
takes orders by voice or typing: "make it cream", "put the wings on the back",
"puff print". Until today it could look back at a darker version ("when it was
darker") but could not make one. "Make it darker" changed nothing.

It now does. "Make it darker", "a bit lighter", "tone it down", "warmer ink",
"lighten the halo" and "a darker green" move the garment colour, or the named
artwork's ink, in CIELAB: lightness, vividness (chroma) and warmth (b* plus
half of a*, our own rule of thumb). A plain step is 12 units; "a bit" is half
that, "a lot" nearly double, "two shades" double.

## The part that matters for a small brand

A screen can show any shade, but a garment colour has to be bought. So the
studio tries the catalogue first: a stock colour that moved the asked way, kept
the hue and lands within CIEDE2000 8 of the target is used by name. "A bit
lighter" on a royal blue tee gives catalogue **blue**. When nothing is close it
keeps the shade as a custom colour, names it ("darker royal blue", #002e7b),
names the nearest stock colour, and says that a custom garment colour means a
lab dip and usually a dye minimum at the mill.

Of the 18 garment edits in our check, 14 landed on a custom colour (the 5 ink
edits all found a catalogue colour). The catalogue's 49 distinct colours are
thin in dark and muted blues, so "a little darker" is often not something a
designer can order off the shelf.
Better to hear that before the quote than after it.

A shade the screen cannot show is refused rather than faked: "make it darker"
on a pure black says it is already as dark as a screen colour goes.

## How it was checked

Fourteen held-out sentences, each with what it should do, were written to a
file before the code existed (`eval/shade-heldout-2026-11-19.txt`), then coded
into checks unchanged. Fifteen dev sentences were written while building. All
are ours, not a designer's.

| | dev (15) | held out (14) |
|---|---|---|
| before | 3 (controls) | 2 (controls) |
| first run | 15 | 13 |
| after one fix | 15 | 14 |

The miss was a real bug. "Make it cooler" on royal blue pushes it bluer, out of
the screen's gamut, and the first version brought it back by lowering chroma.
For a blue, less chroma is warmer, so the clip undid the edit and the studio
said it could go no cooler. Now a warmth or vividness edit is clipped along its
own path, and a lightness edit still gives up chroma so the lightness asked for
is kept. Write-up:
[`eval/shade-edits-2026-11-19.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/clothing-design-studio/eval/shade-edits-2026-11-19.md).

Next: a mill's own stock colours as the palette (from the supplier sheet), and
"darker / lighter" offered as three versions on the comparison panel. The
studio is free and MIT licensed; nothing you type leaves the browser.
