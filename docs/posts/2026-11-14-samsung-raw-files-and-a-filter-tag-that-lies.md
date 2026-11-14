---
title: "Samsung raw files, and a filter tag that lies"
seo_title: "Reading Samsung NX SRW raw files directly, checked against LibRaw"
date: 2026-11-14
tags: [photography, raw, samsung, nx1, srw, open-source, photo-editing]
description: "ShootFlow now develops Samsung NX SRW files itself: all 90 million sensels on four bodies match LibRaw, and two files get their own filter layout wrong."
---

ShootFlow, the open-source photo workflow in this repository, develops raw files into 16-bit masters. As of today it read DNG and the raw formats of Canon, Sony, Nikon, Olympus and Panasonic. Samsung NX shooters still had to send every file through Adobe's DNG Converter first. Now `shootflow develop SAM_0001.SRW --dcp FOLDER` reads the SRW itself, and so does the overnight pipeline's grade stage.

Samsung stopped making cameras in 2015. The NX1, NX500 and NX mini are still bought used, though, and still shot. Their owners have nothing new coming from Samsung, which makes an open reader more useful to them, not less.

## Four formats under one extension

The four sample files cover four different storage schemes. The TIFF compression tag picks between them:

- **32770 with a row table** (Galaxy NX). Each row starts at its own offset. A row is read in blocks of 16 values. A block opens with one direction bit and four 2-bit codes. Each code keeps a bit length, raises or lowers it by one, or replaces it. Every value is a signed step from a neighbour: one or two rows up, or the end of the previous block. After the whole frame is decoded, two sensels in every 2x2 cell swap places.
- **32770 without one** (NX20). Plain 12-bit samples, two in every three bytes, low bits first.
- **32772** (NX3000). One Huffman bit stream with a fixed 14-code table, much like lossless JPEG. Each Bayer column keeps a running value.
- **32773** (NX1). The most elaborate. Rows start on 16-byte boundaries and are read in blocks of 16 in an interleaved order. Each block can pick one of eight prediction modes, either the left neighbour or the mean of two sensels above it. A magnitude scale can multiply every step, and each filter site tracks its own bit length through two blocks of history.

Samsung never documented any of these. dcraw and LibRaw have read them for years, and this reader follows the behaviour they describe. The code is new, and LibRaw is the check.

## The check

The test files are the four camera SRWs in a public sample collection on GitHub: the Galaxy NX, NX1, NX20 and NX3000. Each was read by ShootFlow and by LibRaw 0.22 through rawpy. All 90,513,940 stored sensels were equal. That held for ShootFlow's C decoders (0.2 to 0.5 seconds a file) and for its pure-Python references (17 to 28 seconds for the compressed ones). The white balance, the black level at each filter position, the white level and the filter pattern were also equal on all four.

One bug turned up along the way. dcraw writes the horizontal neighbour as `col + (c | -2)`. That reads like "two to the left of this sensel". It is really "two to the left of the block", because OR-ing with -2 throws away everything but the lowest bit. The first version got it wrong and matched LibRaw for exactly 18 columns.

## What the files showed

- **The filter tag is wrong on half the files.** The Galaxy NX writes (1, 71, 21, 224) as its colour filter pattern, which isn't a pattern at all. The NX3000 writes green-blue / red-green. LibRaw ignores the tag and uses green-red / blue-green, from a per-camera table. To find out which is right without trusting either, the raw frame was compared with the camera's own embedded JPEG. In the NX3000 frame, the sensel at row 0, column 1 tracks the JPEG's red (correlation 0.93) much more than its blue (0.70). So the tag is wrong and LibRaw is right. ShootFlow reads every SRW as green-red / blue-green, and its notes say when the file's tag disagreed.
- **The levels are "encrypted".** The black level and white balance sit in the maker note with a key added to them. The key is stored right next to them, and every file has the same one. Subtract it and you get LibRaw's numbers exactly: a black level of 128 on the NX1 and 0 on the others.
- **The camera's own crop is in the file.** The maker note holds a picture rectangle, and on all four bodies it is exactly the size of the camera's JPEG. LibRaw's per-camera margins differ from it by up to 102 sensels. ShootFlow uses the file's rectangle.

## What's left

Uncompressed SRWs are refused for now because no test file was at hand. The lens name isn't read for lens correction yet. Colour is still only as good as the `.dcp` profile you give it. The full measurements are in `ventures/photo-editing/eval/samsung-srw-reader-2026-11-14.md`.
