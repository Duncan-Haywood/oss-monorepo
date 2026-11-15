---
title: "Fujifilm's Lossy Raw Files Hold a Bit Budget"
seo_title: "Fujifilm Lossy Compressed RAF Decoded, Checked Against LibRaw"
date: 2026-11-15
tags: [photo-editing, raw, fujifilm, x-trans]
description: "ShootFlow now reads Fujifilm's lossy RAFs, every value equal to LibRaw's. Both test files use 4.75 bits per sensel: the size is fixed, the step floats."
---

Earlier today [ShootFlow](/photo-editing/), the open-source photo pipeline in this repository, learned
to read Fujifilm's *lossless* compressed raw files. Newer bodies, the X-S10 and X-E4 among them, have a
second setting that is just called "compressed". It throws some precision away and makes the smallest
files: about 19 MB for a 26 MP frame, against 25 MB lossless. Until now ShootFlow refused those files
and told you to convert them to DNG. Now `shootflow develop DSCF0001.RAF --dcp PROFILE.dcp` reads
them, and so does the overnight pipeline.

## What "lossy" means here

The lossy coding is the lossless one with a dial added. The frame is still cut into strips 768 sensels
wide and coded six rows at a time, and each value is still predicted from its decoded neighbours. The
difference is that each strip stores one small number per group of six rows, a quantisation base `q`.
The gap between the guess and the real value is coded in steps of `2q + 1` instead of single counts.
With `q = 0` nothing is lost. With `q = 4` the step is 9 counts, and each value can land up to 4 counts
from what the sensor gave.

Two more things change with `q`. The thresholds that sort neighbourhoods into 41 contexts widen with
it, and in nearly flat patches the coder switches to one of three small fixed quantisers with their own
contexts. Our first try desynchronised in the second line pair. The cause was our own bug, not the
format: a variable called `step` got reused for the quantiser step inside a loop over steps. Once that
was fixed, every value matched.

## Does it hold up?

The two lossy test files on raw.pixls.us (CC0 samples) were checked against LibRaw 0.22.2:

| camera | sensor values | differing from LibRaw | read time (C, 4 cores) |
|---|---|---|---|
| X-S10 | 26,697,888 | 0 | 0.69 s |
| X-E4 | 26,697,888 | 0 | 0.71 s |

The white balance, black level, white level and colour layout match too. The pure-Python decoder,
for machines with no C compiler, matches on every value as well, at about 74 seconds a file. The
lossless X-T2 and GFX 50S files from this morning were run again after the change and still match on
every value.

## The camera keeps the size fixed

Reading the stored bases shows how the camera decides how much to throw away:

| camera | bases used | average step | bits per sensel |
|---|---|---|---|
| X-S10 | 0 to 9 | 5.7 counts | 4.74 |
| X-E4 | 0 to 13 | 11.2 counts | 4.75 |

Both files come out at the same size per sensel. The X-E4 frame was harder to code, and the camera
made its steps twice as coarse to stay on budget. The size stays fixed and the precision changes.

How much does that cost? If the camera rounds each gap to the nearest step, as our test encoder does,
no value moves more than `q`: at most 13 counts on a scale of 1,022 to 16,383, under 0.1%. We haven't
measured that bound. It needs the same scene shot lossy and uncompressed, and we don't have that pair.

## What it doesn't do yet

Colour still needs the camera's `.dcp` profile, which Adobe's free DNG Converter installs. None ships
with ShootFlow.

The method, the files and the raw results are in
`ventures/photo-editing/eval/fujifilm-lossy-raf-2026-11-15.md`.
