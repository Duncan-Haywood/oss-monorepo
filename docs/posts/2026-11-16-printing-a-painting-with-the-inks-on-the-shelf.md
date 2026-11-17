---
title: "Printing a painting with the inks already on the shelf"
seo_title: "Index screen printing with stock inks: picking them by search"
date: 2026-11-16
description: "Picking a printer's stock inks by eye cost 1.5 to 3.4 delta E on nine paintings. A subset search won most of it back, and from 3 m beat custom inks."
tags: [screen-printing, index-separation, colour, clothing-design-studio]
---

The [clothing design studio](../../ventures/clothing-design-studio/README.md) can turn a
painting into an index separation for screen printing: a handful of inks laid down as
square dots, so the eye mixes them with the bare shirt into the painting's shading. Two
days ago it learned to [move those inks](../../ventures/clothing-design-studio/README.md#inks-chosen-for-the-dots-2026-11-14)
so the dots can reach the painting's darks and strong colours. Every ink it picks that way
is a custom mix, though, and print shops charge to match each colour to a sample.

Most shops have a shelf of ready-made inks. So the studio now has a third choice, "From
the printer's stock": paste the shop's list (a name and a colour per line) and it picks as
many inks as you have screens.

## How it picks

Dots can only mix colours between their inks and the shirt: in linear RGB, the reachable
colours are the convex hull of the inks and the garment. So any set of stock inks can be
scored without printing anything: sample the painting's colours, project each one onto
that hull, and average the distances in CIE Lab, with a small penalty for far-apart inks,
which look grainy up close.

The obvious pick is the one a person would make by eye: for each ink the flat separation
wants, take the nearest ink on the shelf. The search starts there and swaps one ink at a
time for an unchosen one while the score falls. A second start adds inks one at a time,
best first. Then the pick by eye and both searched sets go through the real dot pattern
and the eye model, and the closest wins, so the result is never worse than the pick by eye.

## What it bought, on nine paintings

The test shelf is made up: 25 common screen-printing colour names with approximate
colours, not any ink maker's swatches. The nine public-domain paintings were printed 28 cm
wide; numbers are mean delta E after a rough eye blur, lower is closer.

| Garment, inks | Seen from | Custom flat inks | Nearest stock ink each | Chosen from stock | Freely mixed |
|---|---|---|---|---|---|
| white, 4 | 1 m | 10.64 | 14.07 | 12.25 | 9.55 |
| white, 4 | 3 m | 8.34 | 10.94 | 5.93 | 4.51 |
| near-black, 4 | 1 m | 11.04 | 14.18 | 11.51 | 9.20 |
| near-black, 4 | 3 m | 8.78 | 11.36 | 5.17 | 4.37 |

Three things stood out:

- **Picking by eye is the expensive part.** Swapping each custom ink for its nearest shelf
  ink cost 1.5 to 3.4 delta E across all eight runs of garment, ink count and distance.
- **From across a room, the shelf is nearly enough.** At 3 m the searched stock set beat
  the custom flat inks in 32 of 36 runs, and came within 0.8 to 1.4 of freely mixed inks.
- **Up close, mixing earns its fee.** At 1 m freely mixed inks were still 2.3 to 3.1 closer
  than the best stock set.

The search's choices are not what you'd guess. On Starry Night with three inks on white,
the eye picks look-alike blues and yellows. The search picks lemon yellow, cyan and black,
the corners of the colour range, and lets the dots mix everything in between: 12.41 down
to 7.51 at 3 m.

## What is not known yet

No real shop's shelf has gone through it, and no proof has been printed. The eye model is
a rough blur, and dot gain and the no-single-dots cleanup run after the choice, not
inside it. The full table and per-painting output are in
[`eval/index-stock-2026-11-16.md`](../../ventures/clothing-design-studio/eval/index-stock-2026-11-16.md).
