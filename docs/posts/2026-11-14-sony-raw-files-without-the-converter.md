---
title: "Sony raw files, without the converter"
seo_title: "Reading Sony ARW raw files directly, checked against LibRaw"
date: 2026-11-14
tags: [photography, raw, sony, arw, open-source, photo-editing]
description: "ShootFlow now develops Sony ARW files itself: compressed, uncompressed and lossless. On six real bodies every sensel matches LibRaw."
---

ShootFlow, the open-source photo workflow in this repository, develops raw files into 16-bit masters. Until today it read only DNG and Canon CR2. Anyone shooting Sony had to run every file through Adobe's DNG Converter first. Now `shootflow develop DSC00001.ARW --dcp FOLDER` reads the ARW itself, and so does the overnight pipeline's grade stage.

## Three ways to store a sensor

Sony has stored its sensor data three ways, and the reader handles all of them.

**Compressed RAW** is the format nearly every Sony Alpha and NEX body since about 2008 can write, and five of the six test files use it. Each row is cut into 16-byte blocks. A block holds 16 sensels of one colour, every other column across 32 columns. It stores the largest and smallest value at 11 bits each, where in the block they sit, and fourteen 7-bit steps up from the minimum, shifted left when the block's range is wide. The 11-bit result then goes through a tone curve the file describes with four knees, giving a 14-bit value. This is lossy in the camera. The reader can only give back what the camera kept, and it gives back exactly that.

**Uncompressed** is plain 16-bit values.

**Lossless compressed** is newer (A7 IV, A1, A7R V). The sensor is cut into 512 x 512 tiles. Each tile is a lossless JPEG whose samples are whole 2x2 Bayer cells, four components each. ShootFlow already had a lossless JPEG decoder for DNG and CR2, so the new part is putting the cells back in place. Tiles decode on every CPU.

## The encrypted part

Newer bodies write the black level and the as-shot white balance as plain tags. Older ones keep them only in a block Sony encrypts. A 32-bit key in the file seeds a shift register, and its output is XORed over the block. dcraw and ExifTool both describe the scheme, and ShootFlow has its own implementation of it. One detail cost a failed first run: real files store the key as four raw bytes, not as the number some descriptions suggest.

## The check

The test files are six real ARWs from six bodies, from a public sample collection on GitHub: DSLR-A500, NEX-5N, NEX-7, A5000 and A7 III (compressed) and A7 IV (lossless). Each was read by ShootFlow and by LibRaw 0.22, the library behind most open-source raw tools. All 133.9 million sensels were equal, on both ShootFlow's standard-library and numpy paths. The white balance, black level and colour filter pattern were equal on all six too. With numpy a file reads in 0.4 to 1.5 seconds.

One number in the files was wrong for this job. The encrypted block gives a white level of 15360, but compressed frames hold real values up to 16,372. Using it would have clipped highlights the camera kept, so the reader ignores it.

## What it still needs

An ARW, like a CR2, carries no colour matrix the developer can use, so you supply the camera's `.dcp` profile. Adobe's free DNG Converter installs one per body. Older bodies' masked columns on the right edge are not trimmed, because no tag names them. Sony's own lens-correction data in the file isn't applied yet. Details and the check script: `ventures/photo-editing/eval/sony-arw-reader-2026-11-14.md`.
