# The soft torso: arms lowered against a side that gives (2026-11-16)

Output of `node eval/drape-soft-torso.mjs` (one body: chest 100, waist 88, hip 98, height 178 cm; upper arm and wrist assumed 31 and 16.5 cm). Each garment is sewn with the arms out at 45 degrees; "lowered" then swings the arms down over 0.8 s to `hangAngleDeg` for a side that gives "soft" cm (0 is the rigid ellipse body of 2026-11-13) and settles. The softness is an assumption, not a measurement. worst: the most stretched single sleeve triangle, which sits at the underarm where cap meets side.

Hang angle by softness: 0 cm 28.5 deg, 2 cm 22 deg, 3 cm 18 deg, 4 cm 15 deg

| run | soft (cm) | arm angle | chest % | bicep % mean / peak | worst sleeve triangle % | cuff past wrist (cm) | hem drop (cm) | seam gap (cm) | inside | settled | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| tee S arms out | - | 45 | 0.2 | 6.5 / 23.6 | 66 | -34.5 | -8.1 | 0.09 | 0 | yes | 3920 |
| tee S lowered | 0 | 29 | 0 | 8.9 / 58.8 | 146 | -34.9 | -7.6 | 0.09 | 8 | yes | 4862 |
| tee S lowered | 2 | 22 | 0 | 8.3 / 44.6 | 93 | -35.4 | -8.2 | 0.09 | 0 | yes | 6767 |
| tee S lowered | 3 | 18 | -0.1 | 8.6 / 45.6 | 95 | -35.5 | -8.2 | 0.08 | 0 | yes | 5822 |
| tee S lowered | 4 | 15 | 0 | 8.8 / 46.2 | 97 | -35.6 | -8.3 | 0.07 | 0 | yes | 5876 |
| tee M arms out | - | 45 | 0.1 | 1 / 5.1 | 54 | -34.6 | -8.8 | 0.05 | 0 | yes | 3969 |
| tee M lowered | 0 | 29 | 0 | 4 / 22.9 | 138 | -34.5 | -8.2 | 0.01 | 0 | yes | 5022 |
| tee M lowered | 2 | 22 | 0 | 4.4 / 22.6 | 95 | -35 | -8.6 | 0.01 | 0 | yes | 5625 |
| tee M lowered | 3 | 18 | -0.1 | 4.7 / 23.6 | 98 | -35.1 | -8.7 | 0.01 | 0 | yes | 5928 |
| tee M lowered | 4 | 15 | 0 | 5 / 24.5 | 100 | -35.1 | -8.7 | 0.01 | 0 | yes | 5839 |
| tee L arms out | - | 45 | 0.1 | 0.2 / 1.6 | 34 | -32 | -8.5 | 0.01 | 0 | yes | 3597 |
| tee L lowered | 0 | 29 | -0.1 | 1 / 13.6 | 64 | -32.2 | -8.2 | 0.01 | 0 | no | 4614 |
| tee L lowered | 2 | 22 | -0.1 | 1.4 / 14.6 | 66 | -32.5 | -8.3 | 0.01 | 0 | no | 5604 |
| tee L lowered | 3 | 18 | -0.1 | 1.9 / 15.9 | 70 | -32.6 | -8.3 | 0.01 | 0 | yes | 5771 |
| tee L lowered | 4 | 15 | 0 | 2.1 / 16.8 | 72 | -32.7 | -8.3 | 0.01 | 0 | yes | 6389 |
| longsleeve S arms out | - | 45 | 0.2 | 6.5 / 24.5 | 65 | 5.5 | -8.1 | 0.09 | 0 | yes | 6278 |
| longsleeve S lowered | 0 | 29 | 0 | 8.6 / 61.1 | 138 | 5 | -7.6 | 0.09 | 8 | yes | 7559 |
| longsleeve S lowered | 2 | 22 | 0 | 8.3 / 44.9 | 93 | 4.7 | -8.2 | 0.09 | 0 | yes | 8975 |
| longsleeve S lowered | 3 | 18 | -0.1 | 8.5 / 46 | 96 | 4.7 | -8.2 | 0.07 | 0 | yes | 8835 |
| longsleeve S lowered | 4 | 15 | -0.1 | 8.7 / 47.3 | 98 | 4.6 | -8.3 | 0.06 | 0 | yes | 8868 |
| longsleeve M arms out | - | 45 | 0.1 | 1.1 / 6.7 | 52 | 5.7 | -8.7 | 0.04 | 0 | yes | 5224 |
| longsleeve M lowered | 0 | 29 | 0 | 4.6 / 23.9 | 131 | 6 | -8.1 | 0.01 | 0 | yes | 6211 |
| longsleeve M lowered | 2 | 22 | 0 | 5 / 24.9 | 96 | 5.6 | -8.5 | 0.01 | 0 | yes | 6627 |
| longsleeve M lowered | 3 | 18 | -0.1 | 5.5 / 26.5 | 99 | 5.6 | -8.5 | 0.01 | 0 | yes | 6735 |
| longsleeve M lowered | 4 | 15 | -0.1 | 5.7 / 27.2 | 100 | 5.5 | -8.5 | 0.01 | 0 | yes | 6579 |
| longsleeve L arms out | - | 45 | 0.1 | 0 / 1.1 | 33 | 8.5 | -8.5 | 0.01 | 0 | yes | 4817 |
| longsleeve L lowered | 0 | 29 | 0 | 1.2 / 13.6 | 64 | 8.4 | -8.1 | 0.01 | 0 | yes | 6368 |
| longsleeve L lowered | 2 | 22 | -0.1 | 1.9 / 16 | 66 | 8.3 | -8.2 | 0.01 | 0 | yes | 7187 |
| longsleeve L lowered | 3 | 18 | -0.1 | 2.3 / 17.3 | 69 | 8.2 | -8.2 | 0.01 | 0 | yes | 7294 |
| longsleeve L lowered | 4 | 15 | 0 | 2.6 / 18.3 | 72 | 8.1 | -8.2 | 0.01 | 0 | yes | 7829 |
| hoodie S arms out | - | 45 | 0.1 | 0.4 / 1 | 51 | 7.5 | -7.7 | 0.07 | 0 | yes | 4849 |
| hoodie S lowered | 0 | 29 | 0 | 0.1 / 1.4 | 55 | 10 | -7.1 | 0 | 0 | yes | 6419 |
| hoodie S lowered | 2 | 22 | -0.1 | 0 / 0.2 | 56 | 10.6 | -7.1 | 0 | 0 | yes | 6206 |
| hoodie S lowered | 3 | 18 | -0.1 | 0 / 0.5 | 56 | 10.9 | -7.1 | 0 | 0 | yes | 6772 |
| hoodie S lowered | 4 | 15 | -0.1 | 0 / 1.2 | 56 | 11.1 | -7.1 | 0 | 0 | yes | 6872 |
| hoodie M arms out | - | 45 | 0 | 0.3 / 5.6 | 28 | 8.6 | -7 | 0.03 | 0 | yes | 4694 |
| hoodie M lowered | 0 | 29 | -0.1 | 0.5 / 14.5 | 33 | 8.7 | -7 | 0 | 0 | yes | 5696 |
| hoodie M lowered | 2 | 22 | -0.1 | 0.7 / 17.4 | 30 | 8.4 | -7 | 0 | 0 | yes | 6786 |
| hoodie M lowered | 3 | 18 | -0.1 | 0.8 / 18.6 | 33 | 8.3 | -7.1 | 0 | 0 | yes | 6936 |
| hoodie M lowered | 4 | 15 | -0.1 | 1 / 20.1 | 32 | 8.2 | -7.1 | 0 | 0 | yes | 7237 |
| hoodie L arms out | - | 45 | 0 | 0 / 0.3 | 36 | 8.7 | -8 | 0 | 0 | yes | 5125 |
| hoodie L lowered | 0 | 29 | -0.1 | 1.2 / 6.4 | 32 | 8.7 | -7.8 | 0 | 0 | no | 5969 |
| hoodie L lowered | 2 | 22 | -0.1 | 1.6 / 9 | 36 | 8.5 | -7.8 | 0 | 0 | yes | 7143 |
| hoodie L lowered | 3 | 18 | -0.2 | 1.9 / 10.3 | 37 | 8.3 | -7.8 | 0 | 0 | yes | 7397 |
| hoodie L lowered | 4 | 15 | -0.1 | 2.1 / 11.2 | 39 | 8.2 | -7.8 | 0 | 0 | yes | 8253 |

## Reading

- Arms reach 18 degrees at 3 cm of give (22 at 2, 15 at 4) against 28.5 on the rigid body.
- Points inside the body: rigid lowered S tee and S long sleeve 8 each; every soft run 0.
- Settled: rigid lowered 7 of 9 (tee L and hoodie L still moving); 2 cm 8 of 9 (tee L); 3 and 4 cm 9 of 9.
- Worst sleeve triangle on S and M tee and long sleeve: 131-146% rigid to 93-100% soft. On L it rises a little (64 to 69-72%), hoodies 30-56% throughout.
- Bicep peak: S down from 59-61% to 45-47%; M and L up 1-4 points as the arm comes closer to the side (the cloth pinched between arm and side is still there; the bicep's mean stays the reading to trust).
- Against the rigid lowered runs the hem moves at most 0.7 cm, the chest reading 0.2 points and the cuff 1.1 cm.
- Arms held out at 45 degrees are bit-identical with or without softness (`drape-soft-torso.test.mjs`): the side only softens once the arms start down.

A first version carved the side only below the armpit. The sleeve's underarm then caught between the arm and the rigid torso just above it (one triangle at 213%) and the M tee at 3 cm never settled; carving up to the shoulder shelf fixed both.
