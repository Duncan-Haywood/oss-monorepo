---
title: "A 2004 Kodak raw file, decoded sensel for sensel"
date: 2026-11-18
tags: [photo-editing, raw, kodak, libraw]
description: "ShootFlow now reads Kodak DCS Pro DCR files. On the one public DCR, all 13.6 million sensor values matched LibRaw's, and the C decoder reads it in 0.13 s."
---

[ShootFlow](https://marisstella.app/photo-editing/) develops raw files from
most camera makers without going through Adobe DNG Converter first. Kodak's
DCR was on the list of extensions it copies off a card, but the developer
could not read one. Since today it can.

## Why bother with a 2004 camera

The Kodak DCS Pro SLR/n and SLR/c were the last full-frame Kodak DSLRs, and
people still shoot them. Their files are 14-megapixel raws that Kodak's own
software stopped supporting long ago. Adobe still opens them, and so do
LibRaw and the tools built on it. A pipeline that refuses a DCR makes its user
convert the whole card first.

## What is in the file

A DCR is a big-endian TIFF. The sensor image sits in a SubIFD and uses
Kodak's own compression, number 65000:

- each row is cut into blocks of up to 256 sensels, and every block is
  decoded on its own;
- a block opens with one byte per pair of sensels, two 4-bit bit lengths;
- the differences follow as a bit stream read least-significant bit first,
  four bytes at a time as two big-endian 16-bit words, low word first;
- two predictors, one for each column colour of the Bayer pattern, start at
  zero in every block;
- a length over 12 means the block is stored as plain 12-bit values instead.

The decoded codes are only 10 bits. Kodak's maker IFD carries a 1024-step
table (entry 2317) that maps each code to a sensor value: equal to the code up
to 300, then in steps that grow from 2 to 10, ending at 3700, which is the
white level. The as-shot white balance is a 72-byte record in entry 1021.

## The check

The only public DCR we found is a DCS Pro SLR/n frame in the
[metadata-extractor-images](https://github.com/drewnoakes/metadata-extractor-images)
sample collection. Compared with LibRaw 0.22:

| | ShootFlow | LibRaw |
|---|---|---|
| sensor values that differ | 0 of 13,601,232 | |
| CFA | GRBG | GRBG |
| white level | 3700 | 3700 |
| white balance R/G, B/G | 1.233161, 1.520767 | 1.233161, 1.520767 |
| read time (C decoder) | 0.13 s | |
| read time (pure Python) | 5.1 s | |

The C and pure-Python decoders return identical arrays. Developed with
LibRaw's own colour matrix for the body in place of a camera profile, the
picture's average colour is 0.0023 in chromaticity from LibRaw's render.

## What it does not show

That is one file from one body. The DCS Pro 14n, 14nx and SLR/c should use the
same compression and the same maker entries, but none was at hand to check.
None of that file's 54,216 blocks is stored plain, so the plain path has been
tested only on files the test suite writes itself. Kodak's other compressions,
from the DC-series compacts and the KDC format, are refused with a message.
Colour also needs the camera's `.dcp` profile, as it does for CR2, NEF and the
other formats without a matrix in the file.

The [raw formats page](https://marisstella.app/photo-editing/camera-raw-formats.html)
lists every format and the files each was checked on. The decoder is
`src/shootflow/kodak.py` in the MIT-licensed repository, and the measurements
are in `eval/kodak-dcr-reader-2026-11-18.md`. If you have a DCR from another
DCS Pro body, the check is one command:
`python tools/dcr_libraw_check.py FILE.DCR`.
