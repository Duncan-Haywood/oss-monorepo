---
title: "Letting a simulated arm rest against a soft side: 28.5 degrees down to 18"
date: 2026-11-16
tags: [design, simulation, cloth, open-source]
description: "The drape's rigid body stopped the arms at 28.5 degrees. A side carved round the arm brings them to 18, and all nine test drapes now settle."
---

The [clothing design studio's virtual drape](/clothing-design-studio/drape.html) sews a drafted tee,
long sleeve or hoodie around a body built from your measurements and lets it settle under gravity.
The arms were held out 45 degrees, an A pose, because they could not come down. The body is a stack
of smooth ellipses with no give, and on a 100 cm chest an arm swung down hit the side at 28.5 degrees.
Pressed lower, the sleeve's underarm was crushed between two hard surfaces: 16 points of cloth ended
up inside the body and two of nine drapes never stopped moving.

A real side gives where an arm rests on it. So now, below the shoulder, the torso is carved away round
a lowered arm, leaving 1.2 cm for the two layers of cloth at the side seam. How far the arm may press
in is a number you set ("Side gives"). It is a guess: nobody has pressed an arm into a real side and
measured it for this page, and the pressed flesh is not pushed out at front and back.

| give | arm angle | drapes settled, of 9 | cloth points inside the body |
|---|---|---|---|
| none (rigid) | 28.5 | 7 | 16 |
| 2 cm | 22 | 8 | 0 |
| 3 cm | 18 | 9 | 0 |
| 4 cm | 15 | 9 | 0 |

On an M tee the worst-stretched bit of sleeve at the underarm went from 138% to 98%. What it does not
fix: cloth still gets pinched between arm and side, so the sleeve's peak stretch at the bicep stays high
(and rises a point or few on M and L as the arm comes closer). The average stretch round the arm is the
number to read in this pose. The hem moves less than a centimetre either way.

One thing went wrong on the way. The first version made the side soft only below the armpit. The
sleeve then caught just above it, between the arm and the still-rigid torso. One triangle stretched to
213% and the M tee never settled. Making the side soft up to the shoulder fixed both. With the arms
held out, the drape is exactly what it was before, bit for bit: the side only softens once the arms
start to come down.

The page still opens with the arms out. Pick "Lowered to the side" to see the garment the way it hangs
in a photo. The full table for tee, long sleeve and hoodie in S, M and L is in the
[eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/clothing-design-studio/eval/drape-soft-torso-2026-11-16.md).
It is a picture of ease and tension, not a promise of fit. A sample on a real person still wins.
