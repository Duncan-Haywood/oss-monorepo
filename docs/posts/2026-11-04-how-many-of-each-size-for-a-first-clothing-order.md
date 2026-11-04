---
title: "How many of each size should a new clothing brand order?"
date: 2026-11-04
description: "The Clothing Design Studio now has a size finder and a size run: a bell curve over the audience's chest, instead of an even split."
tags: [clothing-design-studio, fashion, sizing]
---

# How many of each size should a new clothing brand order?

Not 200 split six ways. The studio's default split was a guess typed into a
table. The new [size finder and size run](https://marisstella.app/clothing-design-studio/fit.html)
replaces the guess with arithmetic you can check.

**The size run.** Give it the pieces to make, the audience's average chest and
the spread. It cuts a normal curve at the midpoints between neighbouring sizes
and rounds so the total stays exact. For 200 pieces, a 100 cm average and a 9 cm
spread, it gives XS 18, S 47, M 69, L 47, XL 16, XXL 3.

**The size finder.** A shopper enters a chest measurement, and optionally waist,
hip and height. It shows the finished chest, flat width, length and the ease
(room) in every size, and picks the size nearest the look they want. The garment
can be cut regular while the wearer wants it oversized; then it picks a size up.

**What is not proven.** The size table is a typical adult unisex chart, rounded,
not any factory's; the page says so and takes a factory's chart in a text box
(`S=96, M=104, ...`). Ease values are common trade ranges, not a standard. The
curve puts all of the right-hand tail into the biggest size, so a big spread
overstates it. No designer has yet put a real order through it, and it is
tape-measure arithmetic, not a virtual try-on.

Source and tests (9 cases) are in `ventures/clothing-design-studio/fit.mjs`.
