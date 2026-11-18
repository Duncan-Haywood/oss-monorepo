---
title: "Keeping a burst together when the camera moves: crop-tolerant grouping in ShootFlow's cull"
seo_title: "Crop-tolerant burst grouping for photo culling"
date: 2026-11-17
description: "A perceptual hash split bursts the camera panned 4% through. Matching 88% windows took held-out burst-pair recall from 0.40 to 0.72 for 2 more false merges."
tags: [photo-editing, culling, perceptual-hash, evaluation]
---

ShootFlow is the open-source photo pipeline in `ventures/photo-editing`. Its `shootflow cull` command does what
paid culling apps do for photographers: it reads a folder of stills, groups each burst, keeps the sharpest and
best-exposed frame of each group, rejects the blurred and badly exposed ones, and writes Lightroom star ratings.
Nothing leaves the machine.

Grouping is the part a photographer notices first. If two frames of one burst land in different groups, both
can come back as keepers, and the photographer has to compare them by hand. That is the job the tool was
supposed to do.

## The problem

The cull grouped frames by a 64-bit difference hash (dHash): shrink the frame to a 9 x 8 grid of averages and
record, for each pair of neighbouring cells, which is brighter. Two frames group when at most 8 of the 64 bits
differ. That copes with exposure changes and a little blur. It does not cope with the camera moving.

When the camera pans a few percent between shots, every cell boundary moves across the scene, and many bits
flip. Our showcase run had already shown it: a copy of a photo reframed by 4% became its own group.

## What changed

Each frame now also gets 25 more hashes, one for each window on a 5 x 5 grid. Each window covers 88% of the
frame, and the windows sit 3% apart. If the camera moved 6% to the right between two frames, then some window
in the first frame shows nearly the same part of the scene as the centre window of the second, and those two
hashes agree again.

The rule is careful about when it applies. A pair 9 to 24 bits apart on the whole frame also groups when the best
window pair is within 6 bits and at least 5 bits closer than the whole frames. The second condition matters.
Comparing 50 window pairs between two unrelated photos will find one that is a little closer by chance, but not
much closer. For a real pan, the distance drops sharply.

## How we measured it

We had no real burst sequences with known answers, so we made pairs from real photos with known answers. We
took the 331 decodable JPEGs in the public metadata-extractor-images test corpus: real photos from many camera
and phone models, nearly all of different scenes. From each photo, ffmpeg cut burst-like pairs: two windows
offset by 2 to 10% (horizontal, vertical, diagonal pans), the whole photo against a 3 to 10% zoom, and brightness
changes. Every pair of two different photos served as a negative, a pair that should not group.

The photos with even indices were the tune half; we picked the window grid and thresholds there and looked at
the other half only once.

| held-out half | whole-frame hash | with windows |
| --- | --- | --- |
| burst pairs grouped (5,312 pairs) | 40% | 72% |
| distinct photos merged (13,695 pairs) | 21 | 23 |

Pans of 4% went from 18% to 96% grouped (horizontal) and from 53% to 100% (vertical). Pans of 6% went from 8%
to 85%. Pans of 10% are still mostly split, and so are zooms over 8%: windows of equal size line up a pan
exactly, but a zoom only approximately. That is also why the showcase's 4% corner reframe still splits. Its best
window pair is 7 bits apart, one over the line.

The false merges, before and after, are mostly different photos with the same layout: a dark foreground under a
bright horizon. A sunset session is where this could still go wrong on a real shoot, because one bad link can
chain two groups together.

## Limits

These pairs are cut from one exposure. Real burst frames also differ by subject motion, parallax and noise, so
recall on a real shoot will be lower than 72%. The number that matters, a photographer's own picks on a real
shoot (`shootflow cull --picks`), is still untested.

The evaluation is repeatable: `tools/cull_crop_grouping_eval.py`, write-up in
`ventures/photo-editing/eval/cull-crop-grouping-2026-11-17.md`.
