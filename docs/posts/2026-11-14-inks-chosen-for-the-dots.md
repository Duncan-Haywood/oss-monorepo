---
title: "Screen printing a painting: the inks for dots are not the inks for flat colour"
seo_title: "Index separation inks: choose them for the dither, not the clusters"
date: 2026-11-14
tags: [screen-printing, colour, algorithms, open-source]
description: "Average colours make poor inks for an index print. Inks chosen for the dots, grain counted, cut the error at 3 m by a quarter on nine paintings."
---

The [clothing design studio](/clothing-design-studio/) can separate a painting for screen
print in two ways. Flat: a few inks, each filling an area. Index: the same inks laid down as
a scatter of square dots, so the eye mixes neighbouring dots and the bare garment into the
in-between tones a painting is made of.

Until today both used the same inks, picked by clustering the painting's colours. Each ink
was the average of the area it would fill. That is the right choice for flat colour and the
wrong one for dots.

## Why averages are wrong for dots

Dots mix by area, in linear light. The only colours an index print can make are the ones
between its inks and the garment: in colour space, the solid with those colours at its
corners. Averages sit inside a painting's range of colours, so that solid leaves out the
darkest shadows, the brightest highlights and the strongest colours, and the dither can only
clamp them. On nine public-domain paintings (Van Gogh, Munch, Turner, Hokusai, Matisse,
Picabia, Sassoferrato, Barocci) that limit was most of the 10 to 11 delta E left between the
print and the painting.

The obvious fix, pushing the inks outwards, had been tried before and helped only from 3 m.
Far-apart inks make a grainy print: a mid-blue built from navy and sky-blue dots looks
speckled up close in a way a mid-blue ink does not.

## Counting the grain

The new fit (`inkfit.mjs`) scores each of about 1,500 sampled colours of the painting by
two things at once: how far the best mix of the inks is from that colour, and how far the
dots in that mix are from each other. The second term is scaled by how much the eye's blur
hides at the viewing distance: a lot from 3 m, little from half a metre. Each ink is moved
by a simple pattern search while the score falls.

Then the studio does not trust the fit. It dots the painting with the flat inks and with
three fits of different grain weights, scores each with the same rough eye model, and keeps
the closest. The flat inks are always in the running, so the choice is never worse than
them at the distance you chose.

## What it measured

Four inks on a white tee, 28 cm wide, mean delta E from the painting after a blur
(lower is closer; about 2 is barely visible, 5 plain to see):

| | 0.5 m | 1 m | 3 m |
|---|---|---|---|
| Flat inks, flat | 13.43 | 12.30 | 10.71 |
| Flat inks, dots | 14.48 | 10.64 | 8.34 |
| Inks chosen for 1 m, dots | 15.83 | 9.55 | 6.24 |
| Inks chosen for 3 m, dots | 23.52 | 11.53 | 4.51 |

Chosen for 1 m, all nine paintings came out closer at 1 m. Chosen for 3 m, four inks reach
4.51, against 6.68 for six flat inks dotted: two fewer screens, and closer. The price is
up close: inks spread that far apart look grainy at half a metre. So the page asks which
distance the garment will be seen from, and defaults to 1 m.

## What is not known

No printer has mixed these inks. The chosen colours are screen colours; whether each can be
mixed in plastisol and how it reads on cotton, or over a white underbase on a dark tee, is
for a proof. The eye model is a Gaussian blur, not a model of human vision, so the numbers
compare methods rather than predict what a person sees.

The code is MIT licensed, and the eval that produced the table downloads the paintings and
reruns in a few minutes: `node eval/index-inks.mjs` in the venture's folder.
