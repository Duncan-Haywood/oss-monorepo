---
title: "Three small arrays in a colour mixer"
seo_title: "A faster JavaScript Frank-Wolfe loop with bit-identical output"
date: 2026-11-14
tags: [performance, javascript, screen-printing, open-source, clothing-design-studio]
description: "Writing a tiny Frank-Wolfe loop on plain numbers instead of 3-element arrays made each ink choice 18% faster, with byte-identical answers."
---

The [clothing design studio](https://marisstella.app/clothing-design-studio/) can print a painting on a shirt as an index separation: a few inks laid down as dots, mixed by the eye. Which inks to use is a search. For each candidate ink set it works out, for 1,500 sampled colours of the painting, the closest colour the dots can mix, then moves one ink a little and tries again. The page does this in your browser, and the venture's tests do it four times.

That test was the slowest one we had not looked at: 5.7 seconds. A CPU profile put most of it in `mixWeights`, a 40-step Frank-Wolfe loop that finds the mixing weights for one colour. The loop kept its running mix, its gradient and its step direction as three-element arrays, and made two new ones on every step. Each array is tiny. There are millions of them.

We wrote the loop on plain numbers instead: `p0, p1, p2` in place of `p[0..2]`, the same for the gradient and step. Each line does the same arithmetic in the same order, and JavaScript never fuses a multiply and an add, so the answer has to be the same to the last bit. We checked that rather than assumed it: 200,000 random calls of the old and new function gave identical results and identical weights, and the full ink choice on the test card gave a byte-identical report.

Each ink choice got about 18% faster (1.53 s to 1.21 s at 3 m in our container). The test also stopped making one of its calls twice: its "same input, same answer" check now compares a fresh call against the one the loop above it already made, and compares every candidate's score, not only the inks. The file went from 5.7 s to 3.5 s.

What is left is a pair of powers per mixed colour (linear light to sRGB, and straight back for the Lab distance). Skipping that round trip would be quicker but would change the numbers in the last digits, so it would have to earn its place with a tolerance argument and a re-run of the paintings evaluation. That is written up for the next run in the [perf notes](../history/ci-perf-2026-11-14-clothing-inkfit-scalar-mix.md).
