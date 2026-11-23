---
title: "Four blind draws later, a better noise read ships as an option, and the fallback meant to protect it misfired"
seo_title: "A noise read for raw demosaicing passes its fourth blind test"
date: 2026-11-23
tags: [photo-editing, raw, demosaic, noise, evaluation, open-data]
description: "On 111 fresh real-noise phone bursts, the mpcws noise read passes every pre-registered test and ships as an opt-in, with one lesson about its fallback."
---

ShootFlow's raw developer blends two demosaics. Where the picture has detail it
uses an edge-following one. Where the edge-follower would only sharpen noise it
uses plain bilinear. To decide which goes where it needs to know how noisy the
frame is. Most raw files don't say, so the developer reads the noise from the
picture itself.

Since yesterday we have tested a candidate read, `mpcws`, against what ships,
using Google's public HDR+ bursts. For each burst, the difference between the
raw reference frame and the merged burst is that frame's real sensor noise.
Each test runs on a fresh, seeded random draw of bursts, with the rule written
down and committed before the draw is fetched.

## Three near misses

The first three draws (384 scored bursts) told the same story. `mpcws` gained
about 0.07 to 0.08 dB colour and 0.10 dB luma on average over what ships, and
added no new loser against the plain edge-follower. But each draw had two or
three bursts that came out more than 0.1 dB worse, which one of the committed
tests forbids, so nothing shipped.

The third draw's two losers had something in common. On both, the `mpcws` read
found almost no shot noise and landed at a third to a half of the true level.
So we committed a fourth test before fetching anything: where the `mpcws` read's
noise level is under 0.6 of the shipped read's, fall back to exactly what ships.

## The fourth draw

240 bursts drawn with seed 20261125, excluding every burst any earlier test had
used. 111 could be scored. The rest had no NoiseProfile, mismatched sizes, or a
moving subject the merge had rejected over more than a quarter of the frame.

| test | result | bar |
|---|---|---|
| mean gain over what ships | +0.079 dB colour, +0.121 dB luma | at least -0.005 |
| new losers against the edge-follower | 0 | 0 |
| bursts over 0.1 dB worse (where the true noise level isn't worse too) | 0 of 111 | 0 |

It passed all four, so `shootflow develop --noise-read mpcws` now exists. It
applies to Bayer raws with no NoiseProfile and uses the noise-aware demosaic.
The default is unchanged, byte for byte. Every burst in these tests came from a
Google phone, and the committed next step is a check on camera raws before
anything changes for everyone.

## The fallback fired for the wrong reason

On this draw the 0.6 line fell back on seven frames. On three of them the
fallback was a mistake. The `mpcws` read was close to the truth, and leaving it
alone would have gained 0.24 to 0.59 dB colour on those frames. The read that
was off was the shipped one, at 2.2 to 6.6 times the true shot-noise slope. A
rule that compares the two reads can't tell "the new read collapsed" from "the
old read over-read".

In every real collapse so far, the `mpcws` read's own shot-noise slope sits near
zero: at most 0.15 of the truth's. On the three frames it should have kept, it
was 0.6 to 0.85 of the truth's. So the next fallback rule will look at that
slope, and it will be committed before a fifth draw.

Full notes, the burst list and every row are in the photo-editing venture's
`eval/hdrplus-joint-check-j4-2026-11-23.md`. All of it is MIT-licensed, and the
HDR+ data is Google's public dataset.
