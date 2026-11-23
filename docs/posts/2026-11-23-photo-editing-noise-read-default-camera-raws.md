---
title: "A better noise read becomes the default: checked on 11 camera raws, with the bar set first"
seo_title: "A raw developer's noise read, checked on 11 camera raws"
date: 2026-11-23
tags: [photo-editing, raw, demosaic, noise, evaluation]
description: "The mpcws noise read passed on real phone noise; this run tested it on 11 fresh camera raws under rules set first. It passed, so it is now the default."
---

ShootFlow's raw developer blends two demosaics block by block: an edge-following
one where the picture has detail, and plain bilinear where the edge-follower
would only sharpen noise. Raw files from most cameras carry no noise model, so
the developer reads one from the picture. Today that read changed.

## Where it stood this morning

The candidate, `mpcws`, is a patch-PCA read that first takes each colour's noise
ratio, then the level, and picks its flat patches using that whitened read. On
Google's public HDR+ bursts, where the real sensor noise can be measured, it
passed four tests set before the draw: +0.08 dB colour and +0.12 dB luma over
the read that shipped, no burst 0.1 dB worse, and no new loss to plain
directional. A second draw held. It shipped as an opt-in `--noise-read mpcws`.

It stayed opt-in because every one of those bursts came from a Google phone,
with a 10-bit sensor and the phone's own processing upstream. The note that
shipped it named the next step: try the same option on camera raws that no
earlier tuning had touched, with noise drawn on clean scenes.

## Finding files nobody had tuned on

The usual source of sample raws, raw.pixls.us, refused connections from this
session. The 60 files from one GitHub test-image repository had already been
used to choose between noise reads, so they could not count as blind.

The test folders of three other open-source projects had what we needed: rawpy,
OpenImageIO and darktable. That gave 11 usable Bayer files: Canon 5D Mark II,
Nikon D3X, D3S and D4 (two of them photographs from the International Space
Station), Olympus E-3, Panasonic G1 and GF1, Pentax K200D, Sony A300, a test
chart and a highlight-recovery scene. We excluded a 7D file whose name appears in
an older noise set. Three other files were unusable: one broken, one sRAW, one
SuperCCD.

## The rule, committed before scoring

The rule went into the pull request before any file was run:

- the option exactly as `shootflow develop` runs it, against what ships;
- each file's LibRaw render binned 4 x 4 to make a clean scene, re-mosaicked, and
  noise drawn at four levels, both equal per colour and before white balance (as
  a sensor does);
- the same four bars as the phone test;
- judged only on tiles whose own grain is quieter than the noise added, as every
  camera sweep since 19 November;
- a pass makes it the default, and a fail keeps it opt-in.

## What came out

| | luma over directional | colour over directional |
|---|---|---|
| what shipped | +0.63 dB | +0.40 dB |
| `mpcws` | **+0.85 dB** | **+0.52 dB** |
| the true noise model | +0.90 dB | +0.38 dB |

Across 76 judged rows that is +0.22 dB luma and +0.12 dB colour over what
shipped. No row is worse by 0.1 dB and none loses to directional, so all four
bars pass. Most of the gain is at the two noisiest levels with noise drawn
before white balance: +0.70 dB luma at SNR 12. That is where the old read
under-read most, at 0.31 to 0.94 of the true noise against 0.58 to 1.11 for the
new one.

So from today `shootflow develop` uses `mpcws` on Bayer raws with no noise
profile. `--noise-read ship` still gives the old output byte for byte.

## What the numbers do not say

- **The drawn noise matches the model the read assumes.** Real noise does not
  always, so the phone bursts' smaller +0.08 / +0.12 dB is the better guide to
  how much a real photograph gains.
- **The set is small:** 11 files and 13 tiles.
- **Two tiles go the other way when grainy truths are kept.** Scoring every row,
  including tiles grainier than the noise added, two near-clean rows lose: the
  5D Mark II tile loses 0.58 dB and an ISS frame 0.11 dB. The true model loses on
  both too, because the score there rewards keeping the scene's own grain. That
  is why the rule excluded those rows before the run, not after.

The details, every row and the commands to reproduce them are in
[`eval/camera-drawn-mpcws-2026-11-23.md`](../../ventures/photo-editing/eval/camera-drawn-mpcws-2026-11-23.md).
