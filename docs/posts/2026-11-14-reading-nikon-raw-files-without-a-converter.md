---
title: "Reading Nikon Raw Files Without a Converter: 130 Million Sensor Values, All Matching LibRaw"
seo_title: "Develop Nikon NEF Raw Files in Python Without Adobe DNG Converter"
date: 2026-11-14
tags: [photo-editing, raw, open-source]
description: "ShootFlow now reads Nikon NEF files directly. On seven real bodies, D70 to D810, every one of 130.6 million sensor values matched LibRaw, in 0.1-0.6 s per file."
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, develops raw files into 16-bit masters overnight. Until today a Nikon shooter had to run every NEF through Adobe's DNG Converter first. Now `shootflow develop DSC_0001.NEF --dcp PROFILE.dcp` reads the file itself, and so does the pipeline's grade stage.

## What a NEF holds

The sensor data sits in a TIFF sub-image. Most Nikon bodies compress it, lossy or lossless, at 12 or 14 bits. Each sensel is stored as a difference from a nearby sensel: two columns to the left, or two rows up at the start of a row. The differences are Huffman-coded with one of six code tables, which are fixed by the format. Lossy files then map each value through a curve stored in the maker note's tag 0x0096. Some files store that curve in full. Others store points with straight lines between them, plus a "split row" after which a second code table takes over, one whose codes scale the differences up.

White balance and (on newer bodies) black level come from the maker note too. The reader follows the format as dcraw and LibRaw describe it, but the code is written from scratch.

## How it was checked

There were seven real NEFs, from seven bodies, in a public sample collection: the D70, D90, D200, D300, D5100, D800E and D810. Between them they cover lossy with a full curve, lossy with a stepped curve, lossless at 12 and at 14 bits, and uncompressed. Against LibRaw 0.22:

| | result |
|---|---|
| sensor values compared | 130,596,672 |
| values that differ | 0, in both the C and the pure-Python decoder |
| as-shot white balance, black level, colour filter layout | equal on all seven |
| read time, C decoder | 0.1-0.6 s per file |
| read time, pure Python | 4-29 s per file |

LibRaw and ShootFlow disagree on one number, the D5100's white level. LibRaw takes 15,846 from its built-in table of camera models. But LibRaw's own sensor data for that frame goes up to 16,383, the top of the curve stored in the file. Using 15,846 would clip highlights the camera kept, so ShootFlow uses 16,383.

## Limits

None of the seven files uses a split row, so the second code table has only been tested on files the test suite writes for itself. If you have a NEF where tag 0x0096 gives a non-zero split row, it would close that gap. A NEF carries no colour matrix the DNG colour model can use, so developing one needs the camera's `.dcp` profile, which Adobe's free DNG Converter installs. Nikon's newer high-efficiency NEFs (Z bodies) and Coolpix NEFs are refused with a message to convert them.

The write-up with every number is `ventures/photo-editing/eval/nikon-nef-reader-2026-11-14.md`, and `tools/nef_libraw_check.py` reruns the comparison on your own files.
