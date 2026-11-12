---
title: "A crop that moves the origin: running the DNG TrimBounds opcode"
seo_title: "DNG TrimBounds opcode: cropping inside an opcode list, explained"
date: 2026-11-12
tags: [photography, raw, dng, image-processing]
description: "ShootFlow now runs the DNG TrimBounds opcode: why a crop mid-list changes every later opcode, how it runs without moving pixels, and what is unchecked."
---

ShootFlow, the open-source overnight pipeline for photographers in
`ventures/photo-editing`, develops DNG raw files with its own developer. A DNG
can carry lists of "opcodes": corrections a camera or converter asks the reader
to run, such as a phone's lens-shading map, a lens's distortion warp or a list of
dead sensels. As of today ShootFlow runs thirteen of the fourteen opcodes the
specification defines, each in the list where cameras write it; `TrimBounds` is
the newest, and `WarpRectilinear2` is the one left.

## The opcode is a crop. Why was it last?

`TrimBounds` (opcode 6) takes four numbers, top, left, bottom and right, and crops
the image to that rectangle. A converter writes it after a lens warp, to cut
away the edges the warp leaves with nothing in them.

The catch is that it sits *inside* a list. Adobe's DNG SDK trims the image in
place and resets its origin, so an opcode after the trim sees a smaller image
whose top-left is (0, 0). A per-row gain after the trim is indexed from the
trim's top row, not the sensor's. A vignette correction's optical centre is a
fraction of the trimmed width. A warp's "distance to the farthest corner", which
scales its whole formula, is measured on the trimmed frame, and its edge pixels
clamp at the trim, not at the old border. A reader that crops at the end and runs
everything else on the full frame gets all of those wrong.

## How it runs without moving pixels

ShootFlow's developer streams the sensor row by row before demosaic, so actually
shrinking the image halfway through `OpcodeList2` would mean rewriting the
pipeline. It does not need to. Once the image size is known, each list is walked
once: every trim is taken out, the frames compose (a second trim is in the
first's coordinates), and each opcode after a trim is wrapped with its frame.
A wrapped opcode then runs on that sub-image alone, in its own coordinates, and
the output is cropped to the last frame after encoding. An `OpcodeList2` trim
becomes the frame `OpcodeList3` starts in.

The tests check this against answers written out separately: a vignette, a warp
and a per-row gain after a trim give exactly the bytes they give when run on the
cropped image; an opcode before the trim gives what it gives on the whole image;
a trim alone gives the untrimmed develop's pixels inside the rectangle. Three
deliberately broken versions of the code each fail three to five of the 17 tests.

## What we could not check

Two choices are ours, not the SDK's, and are written down so a real file can
settle them:

- **The demosaic sees the whole active area.** After an `OpcodeList2` trim the SDK
  demosaics only the trimmed image, so its outermost pixel or two are interpolated
  from fewer neighbours than ours. A difference at the very edge, nowhere else.
- **Where the DefaultCrop goes.** The specification gives the final crop relative
  to the active area. We move it with the trim and cut it to the trimmed image.
  If the SDK instead reads it in the trimmed image's own coordinates, a file with
  both will crop differently.

No camera- or converter-written file carrying `TrimBounds` has been tried yet,
and neither has Adobe's SDK. Until one has, this is "matches the specification on
synthetic files", which is what the README says.

The code is MIT licensed: `ventures/photo-editing/src/shootflow/dng_opcodes.py`
(`frame_trims`) and `tests/test_dng_trim_bounds.py`.
