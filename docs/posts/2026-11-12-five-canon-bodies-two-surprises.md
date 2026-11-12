---
title: "Five Canon bodies, two surprises: a neutral white balance and a clip that isn't at the top"
seo_title: "Canon CR2 white level and CFA phase on real 350D, 600D, 70D, 7D files"
date: 2026-11-12
tags: [photo-editing, shootflow, raw]
description: "We ran ShootFlow's Canon CR2 reader on four more real camera bodies. One file was refused and one rendered pink highlights. Here is what was wrong and how the file itself gave the fix."
---

This morning ShootFlow learned to develop Canon CR2 raw files directly, without Adobe's DNG
Converter. At that point it had been checked on one real file, from a 5D Mark II. This afternoon
we found full-size CR2s from four more bodies in a public test-image collection: a 2005 350D,
a 600D, a 70D and a 7D. We ran the reader on all of them against LibRaw.

Most of it held. The decoded sensor matched LibRaw on every sensel of all five files. The image
area, black levels and the camera's white balance matched too. Two files did not.

**The 70D was refused.** A CR2 doesn't say which pixel is red. ShootFlow works it out from the
picture: the two greens are the diagonal that agrees most closely, and red is told from blue by
the white balance the camera chose. This 70D frame was shot with almost exactly equal red and
blue gains (1,993 against 1,964), so that test had nothing to go on. The tool refused rather
than guess, which was the right behaviour but not a useful one.

Every CR2 carries a small uncompressed RGB thumbnail. Earlier we had tried to read the whole
colour layout from it and failed: it is framed differently from the sensor. The question here
is narrower: of the two non-green positions, which one goes up where the thumbnail is red? That
needs only the sign of a correlation over a coarse grid, and the sign survives the framing. On
four of the five bodies the correlation was 0.98 or 0.99 in size and pointed the same way as
LibRaw. The fifth, a dim ISO 3200 street scene, gave -0.06, so there the white balance decides,
as it already did. The 70D now develops with LibRaw's layout.

**The 7D's blown highlights came out pink.** The reader assumed a 14-bit sensor saturates at
16,383. This 7D frame's greens stop at 12,649 and 12,650, with almost 26,000 sensels piled on
those two values. With white set at 16,383, a clipped green sits at 77% while red and blue keep
rising, and the bright sky goes pinkish grey. On the 14,224 clipped pixels of the half-size
render, none came out white.

LibRaw deals with this using a table of white levels per camera model. Its value for the 7D,
13,584, is still above where this frame clips. We read it from the file instead: if one colour
position piles many sensels on its maximum, far more than on the values just below, and well
above black, that maximum is the clip. With that, 69% of those pixels render white, and the
median gap between their brightest and dimmest channel falls from 8% to 1.5%. Frames with nothing clipped are unchanged.

**What's still open.** With the same colour matrix, ShootFlow's renders come out 3-9% brighter
than LibRaw's on every body. The sensor values, levels and balance all match, so the gap is in
the colour model. It is the next thing to check, on a frame with a known grey. The full
measurements are in the venture's `eval/cr2-five-bodies-2026-11-12.md`. ShootFlow is MIT
licensed and runs on your own machine: `shootflow develop IMG_0001.CR2 --dcp PROFILE.dcp --out masters`.
