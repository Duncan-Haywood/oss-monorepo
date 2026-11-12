---
title: "ShootFlow's overnight pipeline now develops Canon CR2, picking the right profile per camera"
seo_title: "Batch-develop Canon CR2 files overnight with the right camera profile"
date: 2026-11-12
tags: [photo-editing, shootflow, raw]
description: "Put your camera's .dcp profiles in a folder and ShootFlow's overnight pipeline turns CR2 files into 16-bit masters, refusing rather than guessing a profile."
---

This morning ShootFlow learned to develop a Canon CR2 directly:
[`shootflow develop IMG_0001.CR2 --dcp PROFILE.dcp`](2026-11-12-canon-cr2-without-dng-converter.md).
The overnight pipeline still could not. It ingests a card, makes proxies, scores every frame,
grades masters and cuts reels while you sleep. Every CR2 stopped at the grade step with
"convert CR2 to DNG". So a Canon shooter woke up to proxies and scores and no masters.

That's fixed. Copy your camera's profile into the shoot's `color/camera-profiles/` folder, next
to the shoot LUT, and the grade step develops each CR2 into a 16-bit TIFF master the same way it
does DNGs.

## Which profile?

A CR2 has no colour matrix, so the profile is the colour. The easy case is one camera and one
profile. The real case is messier. Adobe's free DNG Converter installs several profiles per body
(Adobe Standard, Camera Faithful, Camera Landscape and more), and a wedding shooter may bring two
bodies. So each file gets a profile by the camera that took it, in this order:

1. A file named exactly for the camera, `Canon EOS 5D Mark II.dcp`. Copying a profile to that
   name is how you choose one on purpose.
2. Otherwise, the one profile whose own camera tag names the camera. Every Adobe, dcamprof and
   RawTherapee profile records which camera it is for.
3. If several match, the one called Adobe Standard. That's what Lightroom and Camera Raw apply by
   default.
4. Otherwise the file stops for review and the message names the candidates.

The last rule is the one that matters. A different profile is a different colour. An unattended
job that picks one at random gives you a shoot whose skin tones change between bodies, and you
won't find out until a client does. A stopped file costs you one rename in the morning.

If there's no profile for the camera at all, the message says which folder it looked in and
which cameras it does have profiles for. "No profile for Canon EOS 5D Mark II (it has profiles
for: Canon EOS 7D)" tells you what went wrong without opening anything.

`shootflow develop --dcp FOLDER` uses the same rules for a batch from mixed bodies, and reports
which profile each file got and why.

## Checked on a real file

We ran a real Canon 5D Mark II CR2 (21 MP, from rawpy's test files) and a short clip through
the whole pipeline. The profile folder held a profile for the 5D Mark II and a decoy tagged for
a 7D with a different matrix.

- The pipeline finished in 7.1 seconds with nothing for review.
- It picked the 5D Mark II profile, not the decoy.
- The 5616x3744 16-bit master matched `shootflow develop` with the same profile exactly: the
  largest difference was 0 out of 65,535.
- The proxy came from the camera's own embedded preview. Each frame got real measured scores,
  and the reels, carousel and photo set were all cut.

How close the render itself comes to LibRaw is in this morning's post: a median of 0.61 of an
8-bit step. This run checks only that the pipeline adds nothing to it.

## What's not checked yet

The profile we used was written from LibRaw's matrix for the camera. A real Adobe profile wasn't
available in our build container, so the Adobe Standard rule is tested only on profiles our tests
write. Regional model names like the 600D, which is the Rebel T3i in the US, match only if you
rename the profile file; there's no alias table. And we've run only one Canon body on a real
file so far.

Details and how to reproduce:
[`eval/cr2-pipeline-grade-2026-11-12.md`](../../ventures/photo-editing/eval/cr2-pipeline-grade-2026-11-12.md).
