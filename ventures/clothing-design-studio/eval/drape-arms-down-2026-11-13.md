# Arms held out vs lowered, and the neckline diagnosis (2026-11-13)

Output of `node eval/drape-arms-down.mjs` (one body: chest 100, waist 88, hip 98, height 178 cm). neck3: course stretch within 3 cm of the HPS; ride: highest body-panel point above the HPS.

Hang angle for this body: 28.5 degrees

| run | arm angle | neck3 % | ride (cm) | chest % | bicep % mean / peak | cuff past wrist (cm) | hem drop (cm) | seam gap (cm) | inside | settled | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| tee S arms out | 45 | 10.5 | 2.3 | 0.2 | 6.5 / 23.6 | -34.5 | -8.1 | 0.09 | 0 | yes | 5366 |
| tee S arms lowered | 29 | 10.5 | 2.3 | 0 | 8.9 / 58.8 | -34.9 | -7.6 | 0.09 | 8 | yes | 6769 |
| tee M arms out | 45 | 6.7 | 2.9 | 0.1 | 1 / 5.1 | -34.6 | -8.8 | 0.05 | 0 | yes | 4985 |
| tee M arms lowered | 29 | 7.1 | 2.9 | 0 | 4 / 22.9 | -34.5 | -8.2 | 0.01 | 0 | yes | 7118 |
| tee L arms out | 45 | 6.9 | 2.3 | 0.1 | 0.2 / 1.6 | -32 | -8.5 | 0.01 | 0 | yes | 6309 |
| tee L arms lowered | 29 | 7.1 | 2.3 | -0.1 | 1 / 13.6 | -32.2 | -8.2 | 0.01 | 0 | no | 8234 |
| longsleeve S arms out | 45 | 10.4 | 2.3 | 0.2 | 6.5 / 24.5 | 5.5 | -8.1 | 0.09 | 0 | yes | 7409 |
| longsleeve S arms lowered | 29 | 10.5 | 2.3 | 0 | 8.6 / 61.1 | 5 | -7.6 | 0.09 | 8 | yes | 9362 |
| longsleeve M arms out | 45 | 6.5 | 2.9 | 0.1 | 1.1 / 6.7 | 5.7 | -8.7 | 0.04 | 0 | yes | 7242 |
| longsleeve M arms lowered | 29 | 7.2 | 2.9 | 0 | 4.6 / 23.9 | 6 | -8.1 | 0.01 | 0 | yes | 9605 |
| longsleeve L arms out | 45 | 6.8 | 2.4 | 0.1 | 0 / 1.1 | 8.5 | -8.5 | 0.01 | 0 | yes | 8313 |
| longsleeve L arms lowered | 29 | 7.2 | 2.4 | 0 | 1.2 / 13.6 | 8.4 | -8.1 | 0.01 | 0 | yes | 10679 |
| hoodie S arms out | 45 | 0.1 | 2.6 | 0.1 | 0.4 / 1 | 7.5 | -7.7 | 0.07 | 0 | yes | 7180 |
| hoodie S arms lowered | 29 | 0.5 | 2.5 | 0 | 0.1 / 1.4 | 10 | -7.1 | 0 | 0 | yes | 9570 |
| hoodie M arms out | 45 | 4.9 | 2.4 | 0 | 0.3 / 5.6 | 8.6 | -7 | 0.03 | 0 | yes | 7952 |
| hoodie M arms lowered | 29 | 5.1 | 2.4 | -0.1 | 0.5 / 14.5 | 8.7 | -7 | 0 | 0 | yes | 10237 |
| hoodie L arms out | 45 | 6.5 | 2.1 | 0 | 0 / 0.3 | 8.7 | -8 | 0 | 0 | yes | 8747 |
| hoodie L arms lowered | 29 | 7.1 | 2.1 | -0.1 | 1.2 / 6.4 | 8.7 | -7.8 | 0 | 0 | no | 10634 |
| tee M panels only | 45 | 0.8 | 1.6 | -0.1 | - | - | -6.4 | 0 | 0 | yes | 927 |
| tee M deltoid top flush with the shoulder (dJ 0.9, dR 1.0) | 45 | 7.6 | 2.1 | 0 | 1.1 / 5.5 | -34.3 | -7 | 0.04 | 0 | yes | 5243 |
| tee M friction 0.05 (default 0.4) | 45 | 12.1 | 1.7 | 0.2 | 2.6 / 6.5 | -38.5 | -6.9 | 0.07 | 0 | yes | 5466 |
| tee M arms at 60 | 60 | 3.8 | 3.3 | 0.2 | 0.9 / 4.7 | -34.6 | -9.2 | 0.04 | 0 | yes | 5271 |
| tee M settle 4 s | 45 | 6.7 | 2.9 | 0.1 | 1 / 5.1 | -34.6 | -8.8 | 0.05 | 0 | yes | 8893 |
