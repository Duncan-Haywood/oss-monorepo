---
title: "Putting arms in a cloth simulation found a sleeve half as wide as it should be"
seo_title: "Virtual drape with sleeves caught a pattern error"
date: 2026-11-13
tags: [clothing-design-studio, simulation, patterns, cloth]
description: "Sewing the drafted sleeves onto simulated arms showed the pattern was 24 cm round at M, stretched 37% round a typical arm. Fixed, with three solver bugs."
---

The [Clothing Design Studio](https://marisstella.app/clothing-design-studio/drape.html) got a cloth simulation this morning: the drafted front and back pattern pieces sewn round a body built from your chest, waist, hip and height, then settled under gravity. It had no sleeves. This afternoon's work added them, with arms underneath, and the first run turned up a mistake in the pattern itself.

## What the arms showed

On a body with a 100 cm chest and a typical 31 cm upper arm, the drafted M tee's sleeve stretched **37% round the bicep**. A regular-fit tee should skim the arm, not grip it.

The cause was one line in `pattern.mjs`. The sleeve width came from a formula for the *flat* bicep, the figure you get with the sleeve laid down, which is half the sleeve's girth. The pattern piece is the whole sleeve opened out, though, so its width should be the full girth: twice the flat figure. The M sleeve was drawn 24 cm round. A second error sat next to it: sleeve length ran from the underarm, but the venture's own spec sheet measures it from the shoulder point, so every sleeve came out one cap height (15 to 19 cm) too long. Both errors were in every DXF and SVG pattern the tool had produced.

The fix: full width equals twice a flat bicep of 0.17 × body chest plus 0.1 × garment ease (about 18 cm flat, 36 cm round at M), and length measured from the cap's top. The cap height that follows is about 10 cm, normal for a knit tee. A designer can now enter their own flat bicep.

| M, one body | old sleeve | drafted now |
|---|---|---|
| girth at the bicep | 24.2 cm | 36.4 cm |
| cap height | 16.6 cm | 10.3 cm |
| stretch round the bicep (drape) | 45% | 1% |

Across S, M and L of the tee, long sleeve and hoodie, the old width stretched 27-60% round the bicep and the drafted one 0-1% on the sizes that fit this body (`eval/drape-sleeves.mjs`).

## Three solver bugs, each found by a number

Sewing a sleeve in is harder than closing a side seam: the cap is a curve meeting a different curve, and three pieces meet at the shoulder point.

1. **The shoulder point gapped 3 cm.** The shoulder seam and both cap halves pull on the same corner, and solving the seams one after another left them fighting. Twelve seam passes per step close it to under 0.75 cm, even on a tight XS.
2. **The tee slid 10 cm down the arms.** With the arm's joint a full arm radius below the shoulder, the top of the arm dropped away under the shoulder's edge, and the sewn garment slid down it, stretching the shoulders 14%. A higher joint and a slightly fuller deltoid at the top of the arm fixed it.
3. **The cap was sewn a quarter of the way down.** A grid mesh's outline stops short of a curve's ends, so the cap's edge vertices covered only 28-86% of each half. Matching raw fractions joined the shoulder point to a spot well down the cap. The pairing now uses the span the vertices actually cover.

The pose matters too. With the arms 20° from the sides, an M tee's shoulders stretched 13.8% on average, because the underarm has to wrap under an arm close to the body. At 45°, the A-pose fitting avatars use, that drops to 3.4%, so 45° is the default.

## What isn't solved

With sleeves in, the neckline still shows about 7% stretch, against 1% for the body panels alone, and the tops of the caps bunch slightly. A real tee doesn't pull at the neck with the arms out, so this is the model, not the pattern, and the page says so. The arms are straight and fixed, so you can't yet see a sleeve hang on a lowered arm. No garment has been sewn from either version of the pattern. Every number here comes from a simulation using typical drafting ratios and rough fabric stiffness.

The fix also moved another tool. Once the sleeves were full width, a single tee's true-shape layout stopped beating the rectangle cutting plan; it ties. Two or more tees still beat it by 8-23%. And it turned out the greedy layout could end *longer* when allowed to turn pieces than when not (194 cm against 182 for two tees), so it now tries both.

[Try the drape](https://marisstella.app/clothing-design-studio/drape.html). It runs in your browser, and enter a flat bicep to see a narrower or wider sleeve. The source is MIT-licensed in [`ventures/clothing-design-studio`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/clothing-design-studio). This is open request [R-0005](https://marisstella.app/custom-development/R-0005/).
