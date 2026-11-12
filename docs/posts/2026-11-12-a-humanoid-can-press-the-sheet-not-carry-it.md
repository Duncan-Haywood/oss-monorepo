---
title: "A stock humanoid can press the sheet, but it can't carry it there"
date: 2026-11-12
tags: [buildbot-sheathing, construction-robotics, mujoco, humanoid, unitree]
seo_title: "Can a Unitree G1 or H1 humanoid hang a sheet of wall sheathing?"
description: "Static MuJoCo checks: a G1 holds 8.7 kg at most and an H1 18.8 kg, short of a 21.8 kg OSB sheet, but on a ledger both can press it, and their stock gains let the ledger square it."
---

The last step of the `buildbot-sheathing` programme found that a ledger board can square a sheet of wall sheathing for a robot. The robot sets the sheet on the board, lets it roll, and presses under about 100 N. This step asks whether a stock Unitree G1 or H1 humanoid can be that robot. We wrote down four hypotheses before running anything.

The models are the G1 and H1 from MuJoCo Menagerie. The check is static: the feet stay planted, every joint must stay inside its torque limit, both soles must carry load, and the feet must not slip.

- **Neither robot can carry the sheet to the wall.** A 4x8 sheet of 7/16 in OSB weighs 21.8 kg. With its hands between 0.6 and 1.3 m high, the G1 holds at most 2.8 to 8.7 kg in both hands, limited by the waist and wrist pitch joints. The H1 holds 12.4 to 18.8 kg, limited by the elbows. We had predicted the H1 could carry it, so that half of the hypothesis is refuted. A lift or a person has to stand the sheet on the ledger.
- **On the ledger, both can press.** The G1 presses 66 to 110 N into the wall and the H1 128 to 281 N. The G1 is light enough that its feet slip at about 98 N on a low-friction floor.
- **Sliding the sheet along the ledger has a height limit.** The sheet usually needs to slide sideways onto its stud line, which takes ledger friction times the sheet's weight plus the wall friction from the press. Push too high and the trailing corner lifts. With the press at the push height, the wall friction's moment cancels and the limit is just W/(2μ): 2.03 m at a ledger friction of 0.3 and 0.87 m at 0.7. MuJoCo agreed within 1.6% in all 14 cases. A G1 can manage the slide on a slippery ledger (0.3) but not at 0.5. It can't do it through palm friction at all, because the palms would need more grip than the wall has, plus 107 N to 1.5 kN of press. It has to push the sheet's edge.
- **Stock gains are soft enough, which surprised us.** We expected a robot holding its pose to be too stiff for the ledger to turn the sheet. At Unitree's own published joint gains (60 N·m/rad on the G1's arms), the sheet's stiffness about the corner that lands first is 2.9 to 31 times below the level at which a hold keeps its error. The one exception is an H1 clamping the sheet rigidly: its four-joint arms can't turn the forearm end, so it keeps 0.46 to 0.99° of a 1° error. Releasing the G1's wrist roll barely matters.

There's a catch. The same softness means the sheet's own weight would twist a stock-gain hold by 10 to 14° if nothing else carried it. The ledger taking the weight is what makes a soft hold workable, and a controller has to stop feeding the weight forward the moment the sheet lands.

So in this programme a stock humanoid isn't the hanger. It's the presser and nailer, once a lift or a person sets the sheet on a ledger. The end-to-end cycle in milestone 5 will use that split.

What it is not: everything here is static, with no walking or balance controller. The force is split evenly between the hands, though an edge push would load one. Joint gains are taken as the only compliance. Ledger and palm friction were swept because we found no measured values. Code, results, the figure and the pre-registered plan: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
