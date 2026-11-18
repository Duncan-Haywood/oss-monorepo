---
title: "How many inks is a painting on a shirt worth?"
date: 2026-11-04
description: "The clothing design studio now separates a painting at 2 to 8 inks, prices each on your supplier sheet and shows how close the flat colours get."
tags: [clothing-design-studio, screen-print, costing]
---

# How many inks is a painting on a shirt worth?

Every extra ink in a screen print is another screen and another setup fee. A
painting never reduces to a clean number of colours, so a designer guesses.

The studio's new "How many inks is it worth?" button separates the uploaded
painting at 2 to 8 inks and prices each result on the designer's own supplier
sheet (screens, plus a white underbase on dark garments). Next to each cost it
shows the mean CIE76 colour distance between the flat inks and the original
pixels, and names the fewest inks after which one more ink improves that
distance by less than 1.

On a test image with exactly three flat colours the distance falls from over 5
at two inks to under 1 at three, and the tool picks three. That is a synthetic
check. It has not been run on a real painting through a real printer, and a
colour distance is not a proof: the printer's sample decides. Prices are the
example sheet's placeholders until the designer types a real quote.

Code: `ventures/clothing-design-studio/inktradeoff.mjs`. MIT.
