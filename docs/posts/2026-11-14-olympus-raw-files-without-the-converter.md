---
title: "Olympus raw files, without the converter"
seo_title: "Reading Olympus ORF raw files directly, checked against LibRaw"
date: 2026-11-14
tags: [photography, raw, olympus, om-system, orf, open-source, photo-editing]
description: "ShootFlow now develops Olympus and OM System ORF files itself. On 18 real bodies, from a 2002 compact to the OM-1, every sensel matches LibRaw."
---

ShootFlow, the open-source photo workflow in this repository, develops raw files into 16-bit masters. This morning it read DNG, Canon CR2, Sony ARW and Nikon NEF. Olympus and OM System shooters still had to run every file through Adobe's DNG Converter first. Now `shootflow develop P1010001.ORF --dcp FOLDER` reads the ORF itself, and so does the overnight pipeline's grade stage.

## A file that says it isn't compressed

An ORF looks like a TIFF with a different magic number. Its tags say the sensor is stored uncompressed, 16 bits per value. On every E-system, PEN, OM-D, OM System and Tough body in the test set, that is not true. The strip is Olympus's own compression: one bit stream for the whole frame. Each value is coded as a difference from a prediction. The bit width adapts to how large the last few differences were, and each column parity is tracked on its own because the Bayer colours alternate. The prediction picks among the values two to the left, two above and two up-left. It averages left and up on gentle slopes and uses `left + up - upleft` on steep ones.

Since the tags lie, the reader decides by size, as dcraw does. A strip of exactly 12 or 16 bits per value is plain storage. Anything else is compressed. A first draft said "under 12 bits per value means compressed". The test suite's deliberately noisy frame broke it at 12.7. One of the real files, a TG-4 frame, already sits at 11.3, so a noisier one from that camera would have been misread.

## The compacts store their rows out of order

The four oldest files (the C-5050 Zoom, C-8080, SP-350 and SP-500 UZ) are 12-bit packed. Row 0 matched LibRaw, row 1 didn't. Searching each file for LibRaw's rows settled it: the even rows come first, then the odd rows start at the next 2048-byte boundary. The TIFF tags also describe one row fewer than the camera stored (1925 of 1926 on the C-5050). The last row sits in the file past where the tags say the image ends. The reader takes it.

## The check

The test files are 18 real ORFs from 18 bodies, from a public sample collection on GitHub, spanning 2002 to 2023. Each was read by ShootFlow and by LibRaw 0.22, the library behind most open-source raw tools. All 219.6 million sensels were equal, both on ShootFlow's C decoder (0.2 to 0.5 seconds a file) and on its pure-Python reference (9 to 19 seconds). The white balance, the black level at each colour-filter position and the filter pattern itself were equal on all 18.

## Columns that aren't picture

Several bodies store a few columns at the right edge that are not part of the image. On the E-30, E-600 and E-PL1 there are four columns sitting at black level. On the TG-6 and TG-7 they are dim, at about a quarter of the picture's level. LibRaw trims them with rules keyed to the sensor width. The ORF's maker note already names the frame of the camera's own JPEG (4608 x 3456 at an offset of 8 on the E-M10), and that frame leaves them all out. ShootFlow now uses it as the crop.

## What's left

The white level is the 12-bit ceiling, 4095. On four of the 18 bodies LibRaw uses a lower value from a per-model table (4028 on the E-30), and nothing in those files states one. Colour is only as good as the camera profile you supply, and none ships with ShootFlow. Two older layouts, from the E-1 and E-300 era, are refused with a message, because no sample file was at hand to check them against. Panasonic's RW2 is next. The same collection has four of them.

Code: `ventures/photo-editing/src/shootflow/orf.py`. Measurements: `ventures/photo-editing/eval/olympus-orf-reader-2026-11-14.md`.
