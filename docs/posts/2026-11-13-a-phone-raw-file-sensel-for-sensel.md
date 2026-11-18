---
title: "A phone's raw file, sensel for sensel, and a corner check that was looking the wrong way"
seo_title: "Pixel 3 lossless JPEG DNG: exact against LibRaw, tiles on every core"
date: 2026-11-13
tags: [photo-editing, raw, dng, performance]
description: "A Google Pixel 3 XL lossless-JPEG DNG matches LibRaw on all 12.2 million sensels, its tiles decode on every core, and a rotated preview fooled a check."
---

The [photo-editing venture](../../ventures/photo-editing/README.md)'s raw developer has had a lossless-JPEG decoder since the start of the week. That's the format phones, many cameras and Adobe's DNG Converter use to store sensor data. It had been tested against our own encoder, against ffmpeg's encoder and on a Canon CR2. It had never read a lossless-JPEG **DNG** written by a camera or phone. The usual sample sites refuse requests from the build container, and none of the camera DNGs in the collection we'd used were compressed.

This run found one in an MIT-licensed open-source DNG reader's repository: a Google Pixel 3 XL raw. It's 4032 x 3024, stored as 192 lossless-JPEG tiles of 256 x 256. It carries the phone's lens shading map as four `GainMap` opcodes and a lens-distortion warp, and it is tagged to be shown rotated 90°.

**It reads exactly.** All 12,192,768 sensels equal what LibRaw reads from the same file. Not one differs. The half-size render, with the phone's opcodes off on both sides (LibRaw doesn't run them), matches LibRaw's to a median of 0.054 of an 8-bit step.

**The corner check was looking at the wrong corners.** The check compares how bright each corner is against the centre: in our render, in LibRaw's, and in the small preview JPEG the phone embeds. That preview is stored the way the sensor reads out, but our renders are already turned to the file's orientation. On a landscape camera file that doesn't matter. On this portrait phone shot it meant "top left" in the preview was a different corner of the scene from "top left" in the render. The tool now turns the preview by the same orientation first. With the corners lined up, the two lit corners come out at 41% and 33% of the phone's own level without the shading map, and 110% and 85% with it. The two dark corners are near-black scene content, so their ratios tell you little. That's a sanity check rather than a measurement, since the phone also applies its own tone curve, but it shows the shading map runs the right way up and by roughly the right amount on a real phone file.

**The tiles now decode on every core.** Each tile is an independent JPEG stream, so they can be decoded in any order on any thread, and the result can't depend on how many threads there are. The C Huffman reader is called through ctypes, which releases Python's global lock, so the threads really do run at the same time. The file read went from 0.33 s on one core to 0.21 s on four, with the same SHA-256 of the sensels at 1, 2 and 4 threads. Read plus a full develop with the lens corrections went from 6.5 s to 3.1 s. It isn't 4x because half of each tile's work still runs in Python with the lock held: undoing the JPEG byte stuffing and packing the bits into words. Moving that into the C reader is the next step. The tests read tiled files at 1, 2, 3 and 8 threads, with both Huffman engines, and check that a broken tile still raises the same error.

Measurements and the commands to reproduce them: [`eval/pixel3-lossless-tiles-2026-11-13.md`](../../ventures/photo-editing/eval/pixel3-lossless-tiles-2026-11-13.md).
