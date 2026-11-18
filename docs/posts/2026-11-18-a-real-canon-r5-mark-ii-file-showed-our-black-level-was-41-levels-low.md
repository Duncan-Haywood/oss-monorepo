---
title: "Nine real Canon R5 files: every sensel right, and a black level 41 levels low"
seo_title: "Canon R5 Mark II CR3 black level: why the masked columns lie"
date: 2026-11-18
description: "ShootFlow's CR3 reader matched LibRaw on 290 M sensels of real R5, R5 Mark II and R3 files, but the R5 Mark II's black and white balance were wrong. Now fixed."
tags: [photo-editing, camera-raw, canon, evaluation]
---

ShootFlow develops Canon CR3 files without Adobe's DNG Converter. Until today its reader had
been checked on five real files, all from an EOS R8 and an R3, because the public raw sample
archive raw.pixls.us refused this build container's network proxy. Today it answered, so nine
more real files went through the same check: four from an EOS R5, four from an R5 Mark II and
one R3, in both of Canon's raw qualities and in full-frame and crop modes. The check compares
every value with LibRaw 0.22, an independent open-source reader.

## The sensor data: all equal

All 290.1 million sensels came back equal to LibRaw's, on all nine files. The pure-Python
reference decoder, run on two of them, gave the same values as the C decoder. The C decoder
reads a 45-megapixel R5 frame in 1.3 s.

## Not tiles after all

The reader can take a frame stored as several tiles side by side. The code assumed Canon's widest
sensors, "the R5 class", write files that way. They don't. All nine files are a single tile,
including the R5's 8,352-sensel rows and the R5 Mark II's 8,480. So the tiled code path is still
checked only on real R8 frames we re-stored as tiles ourselves. The open item is now to find a
body that really writes tiles. Re-testing the tile code on more synthetic files would add little.

## The R5 Mark II: black too low, no white balance

Every sensel matched, but the R5 Mark II's frames still developed wrong in two ways:

- **No as-shot white balance.** Its colour block (Canon's ColorData, version 12, 4,528 entries)
  was not in the reader's table. The balance sits at the same place as in version 11, so this
  was a one-line fix.
- **Black level 8 to 41 levels low.** ShootFlow measured black as the median of the masked
  sensor columns that the file's own IAD1 box calls optical black. On the R5 Mark II that
  rectangle covers two strips. Columns 132-259 are the real optical black, averaging 512.2. Columns
  0-131 are something darker and noisier, about 470. In full-frame mode the median of both strips
  came out at 504. In APS-C crop mode the rectangle covers only the dark strip, and the median
  came out at 475.

A black level 37 levels low lifts a tone five stops under middle grey by half a stop, and true
black develops as a grey veil. It is a quiet fault: nothing crashes and nothing looks broken
until a night scene comes out milky.

## The fix: trust what the camera states

Canon writes a per-channel black level into ColorData. Searching each version's block for
LibRaw's four values found it at index 0x157 on the R5, 0x16B on the R3 and 0x17F on the R5 Mark
II. On every file it equals LibRaw exactly. The reader now uses that stated level wherever its
place is known, and adds a note to the develop log when the masked columns measure more than 4
levels away. Where the index is not known (the R8's ColorData and every older version), it
measures the masked columns as before. After the fix, black level and white balance match LibRaw
on all nine files.

The measurements, file hashes and both runs (before and after the fix) are in
`ventures/photo-editing/eval/canon-cr3-r5-real-2026-11-18.md`. The camera formats page,
[camera-raw-formats.html](https://marisstella.app/photo-editing/camera-raw-formats.html), now
lists these bodies.
