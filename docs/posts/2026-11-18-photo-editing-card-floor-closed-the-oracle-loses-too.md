---
title: "The card noise floor, closed: on 24 unseen cameras the true noise model loses too"
seo_title: "Card noise floor closed: on 24 cameras the true model loses too"
date: 2026-11-18
tags: [photo-editing, raw, denoising, statistics]
description: "A second-lowest card floor halved the cost of the minimum but still missed its bar, and the rows it was meant to fix lose even with the exact noise."
---

ShootFlow's raw developer reads a frame's noise from the frame itself when the
file carries no noise profile, and uses it to blend the directional demosaic
toward plain bilinear where detail is buried in noise. Earlier today [three
rules failed](2026-11-18-photo-editing-card-noise-floor-three-rules-none-passed.md)
to improve that reading with a card-level floor: the lowest reading across one
camera's frames, which shares the sensor's noise but not the scene's texture.
The best of them, a cap at 1.5 times that floor, removed 17 of 24 losing rows
and missed its pre-set bar by 0.005 dB of mean luma.

That note left two fixes open. This run tried both.

**Taking the floor before white balance.** Each frame's reading is divided by
its own white-balance noise factor before the floor is taken. On the 5,312
rows the earlier sweeps already wrote, this moved the median floor by 0.01 at
most. A card's frames are shot under similar light, so their gains barely
differ. Closed without a scored run.

**Taking the second-lowest scene, not the lowest.** A minimum of noisy readings
sits below the truth, so the cap bit frames that needed their full model. On the
same seen rows, the second-lowest scene cut those harmful binds from 194 to 56.
That was the pick. Its rule was written and pushed before the test set was
fetched: 96 raw.pixls.us files from 26 bodies that no earlier sweep had read,
including Pentax, Leica, Leaf, Kodak, Samsung, Fujifilm's Bayer X-M5, OM System
and the newer Nikon and Sony folders. LibRaw opened 83 of them, and they
held 53 distinct scenes.

| 440 rows on cards of 3+ scenes | mean luma gain over directional | rows losing > 0.1 dB |
|---|---|---|
| what ships | +0.916 dB | 5 |
| cap at the lowest scene | +0.880 dB | 5 |
| cap at the second-lowest scene | +0.895 dB | 5 |

The second-lowest floor halved the cost (0.020 dB against 0.035), but the bar
was 0.01, and it fixed none of the five losing rows. So nothing ships.

The five rows explain why. We re-ran them with the *true* noise model, the
one a perfect estimator would give. It loses just as much: −0.58 dB of luma on
a Pentax K-3 Mark III tile at SNR 200, the same as what ships. These frames
read their own noise at 0.9 to 1.8 times the truth, so the reading is not the
problem. On that detail at that noise level, the bilinear half of the blend is
worse than directional, and the blend still gives it weight. A card floor can
only fix the other kind of loss, frames whose texture reads as many times the
noise, and this set had none of those.

So the card floor is closed after four sets and five rules. It helps only on
near-clean frames whose fine detail reads as noise. Everywhere else it costs
0.015 to 0.035 dB of mean luma, and that is not worth a product option. The
next lead is in the blend itself: a gate near clean, which can be tested with
the true-model rows of the four card sets, because they separate the blend's
losses from the estimator's.

Everything is in the repository: the rule, the files list, every row, and the tools
(`tools/pixls_list.py` builds a raw.pixls.us set that skips bodies already
read; `tools/card_floor_ranks.py` and `tools/card_floor_rule.py` score it).
Write-up:
[eval/noise-card-floor-rank-2026-11-18.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/noise-card-floor-rank-2026-11-18.md).
