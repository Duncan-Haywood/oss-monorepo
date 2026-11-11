---
title: "Four flat inks cannot print a painting. Four inks as dots get closer."
seo_title: "Index separation vs spot colour: screen printing paintings on shirts"
date: 2026-11-11
tags: [clothing-design-studio, screen-printing, algorithms, research]
description: "On nine real paintings, flat inks stayed 6 to 14 delta E from the original even at eight inks. The same inks as dots were closer from 1 m on eight of nine."
---

A designer we interviewed wants to print classical and devotional paintings
on shirts. The Clothing Design Studio already separated a painting into a few
flat inks for screen print. This week we ran that separation on nine real
public-domain paintings: Van Gogh's Starry Night, Munch's Scream, Turner's
Shipwreck of the Minotaur, Hokusai's Great Wave, Matisse's Woman with a Hat,
Picabia's Udnie, Sassoferrato's Madonna in Prayer, a framed Barocci and a
small Munch Madonna.

Flat inks did badly. Even at eight inks, the average colour distance from the
painting was 6 to 14 CIE76 delta E. About 2 is barely visible and 5 is plain to
see. A painting is shading, and a flat ink has one tone.

Screen printers handle this with an *index* separation: the same few inks
printed as a scatter of square dots, so the eye mixes neighbouring inks and
the bare shirt into the in-between tones. The studio now has one. It uses the
flat separation's inks, treats the garment colour as a free extra colour, and
places one dot per finest dot the mesh can hold (0.3 mm by default) by error
diffusion in linear light.

To compare the two, we blurred both the painting and the print the way an eye
roughly blurs at a given distance (1 arcminute), then measured the distance.
With four inks on a white shirt, the averages over the nine were:

| Seen from | Flat inks | Index dots |
|---|---|---|
| 0.5 m | 13.4 | 14.5 |
| 1 m | 12.3 | 10.6 |
| 3 m | 10.7 | 8.3 |

Up close the dots show, so index loses. From a metre it was closer on eight
of the nine paintings. The one miss was a 184-pixel thumbnail, whose dots come
out 1.5 mm wide. From across a room, four inks as dots (8.3) beat six flat
inks (8.9). That is two fewer screens for the same look, and every screen
costs money on every run.

Two things went wrong on the way. Plain error diffusion did worse than flat,
because a painting's colours often lie outside what four inks can mix. The
error then runs away into streaks. Clamping the corrected colour fixed that.
Our second try, refitting the inks to what the dither asked of them, made
things worse and was dropped.

The limits are plain. Neither method gets near "barely visible", because four
inks cannot reach many of a painting's colours: dots remove the banding, not
that limit. The eye model is crude. And no printer has pulled an index print
from these films yet. Whether a single 0.3 mm dot holds on their mesh, and how
much dot gain darkens it, is what a proof will show.

The tool is free and runs in the browser, and nothing is uploaded. The method
and every number are in the venture's README under "Index separation for
paintings", and `eval/index-paintings.mjs` reruns the measurement.
