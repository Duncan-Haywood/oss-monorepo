---
title: "Why our simulated tee pulls at the neck, and why lowering the arms didn't help"
seo_title: "Cloth simulation: diagnosing a neckline stretch artifact"
date: 2026-11-13
tags: [clothing-design-studio, simulation, cloth, negative-result]
description: "With sleeves sewn in, the drape showed 6.7% stretch at the neckline. Five measured runs found the cause; lowering the arms was tried and kept off."
---

The [Clothing Design Studio's virtual drape](https://marisstella.app/clothing-design-studio/drape.html) sews a drafted tee onto a body built from your measurements and lets it settle under gravity. Since sleeves went in earlier today, one thing has looked wrong: the neckline of a regular M tee shows **6.7% stretch** round the body, against 0.8% when the body panels hang alone. A real tee doesn't pull at the neck. The open question was whether the pattern caused it or the model did.

## Five runs, one variable each

Same body (chest 100, waist 88, hip 98, height 178 cm), same M tee. Only one thing changed per run:

| change | neck stretch |
|---|---|
| default | 6.7% |
| the deltoid bump lowered until its top sits flush with the shoulder point (it stood 4 cm above) | 7.6% |
| contact friction 0.05 instead of 0.4 | 12.1% |
| arms raised from 45 to 60 degrees | 3.8% |
| twice the settling time | 6.7% |

The first suspect, the 4 cm hump of the simulated deltoid that the shoulder seam has to climb over, is cleared: flattening it made the neck slightly *worse*. A run that hadn't finished settling is cleared too, since doubling the time changed nothing. The two runs that did move it point the same way. Make the sleeves slip more easily on the arms and the stretch doubles. Tilt the arms up so they slope down less and it halves. The sleeves sit on smooth capsule arms, held only by friction, and they pull the shoulders outward along the arm. The neckline takes up that pull.

So the yellow at the neck comes from how the sleeve is held on the arm, not from the pattern. The page now says that and gives the numbers.

## Lowering the arms: tried, measured, kept off

The obvious next step was to let the arms hang. The simulator can now sew at 45 degrees and then swing both arms down about the shoulder joint, carrying the sleeves with them (`lowerArms: true`). On this body the arms only come down to **28.5 degrees**. The torso is a stack of ellipses whose girths match your tape measurements, but it has no soft tissue, so at the armpit it is wider than a real chest the arm presses into. Any lower and the arm would pass through it.

Across tee, long sleeve and hoodie in S, M and L, the lowered pose moved the hem by at most 0.6 cm and the neck by at most 0.7 points. It also added error. Cloth pinched between the arm and the side showed up as bicep "stretch" of up to 61%. On the S tee and long sleeve, eight underarm points ended up inside the body, and two of the lowered runs hadn't fully settled when time ran out. A pose that adds false readings without changing the true ones doesn't belong on the page, so the page keeps 45 degrees. The option stays in the code with its evaluation script (`eval/drape-arms-down.mjs`), so the next attempt can start from these numbers.

## What would actually fix it

Arms that really hang need a torso the arm can rest against: a soft outer layer or a section shaped from a body scan. The neckline needs the sleeve cap to hold its own dome, either with a stiffer seam at the top of the cap or with bending stiffness in the cap itself, so the sleeve's weight goes into the shoulder point and not into a slide down the arm. Both are on the [roadmap](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/clothing-design-studio/ROADMAP.md). As always, a sample garment on a real person beats any of this.
