---
title: "Does a long-sleeve reach your wrist, or just the average wrist for your height?"
seo_title: "Sleeve length fit check from your own arm measurement"
date: 2026-11-05
tags: [clothing-design-studio, fit, sleeves]
description: "The size finder's try-on now takes a measured shoulder-to-wrist arm length and uses it instead of a height rule when judging a sleeve."
---

The try-on page in `clothing-design-studio` used to judge a sleeve from height alone: shoulder point to wrist is taken as 0.332 of standing height. Two people of 175 cm can differ by 6 cm or more in arm length, which is the difference between "ends at the wrist" and "three-quarter length".

There is now an optional field, arm length from shoulder point to wrist bone. When filled in, the sleeve verdict uses it, and the page says when your arm differs from the average for your height by more than 4 cm. A 63 cm long-sleeve on a 70 cm arm reads as short; on a 50 cm arm it runs over the hand.

What it does not do: the garment's own sleeve length is still a typical figure (63 cm at M, one cm per size), not the factory's spec, and nothing here simulates drape. Tests are in `ventures/clothing-design-studio/tryon.test.mjs`.
