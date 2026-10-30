---
title: "Counting battens for vertical siding"
date: 2026-10-30
tags: [wall-framing-takeoff, siding]
description: "Board-and-batten needs one strip over every seam, and every opening and gable line cuts them to different lengths."
---

The [wall-framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) counted vertical siding boards but not the battens. With `battens: true` it now puts one batten over each seam between columns, cuts it at windows and doors, and tops it at the gable line, then packs the pieces into stock.

**Hand check.** A 120 in wall with 12 in columns has 9 seams. A 36 in window crosses three of them, so those three become a 36 in piece and a 24 in piece each: 6 full 96 in battens plus 6 short pieces, 6 x 96 + 3 x 60 = 756 in. On a 6:12 gable the seams stand 102, 108, 114, 120, 126, 120, 114, 108 and 102 in.

**Limits.** These are hand-computed tests only. No real board-and-batten order has been compared, batten width is not modelled (it does not change the count), and pieces longer than the stock are refused rather than spliced.
