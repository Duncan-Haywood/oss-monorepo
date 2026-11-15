---
title: "Reading Lumix raw files from the GH5 to the S5, and the white point we got wrong first"
seo_title: "Panasonic RW2 decoder in Python: S1, S5, G9 and GH5S match LibRaw"
date: 2026-11-15
tags: [photo-editing, shootflow, raw, panasonic, rw2, image-processing]
description: "ShootFlow now reads the RW2 layouts Lumix bodies have used since 2017: on 12 real cameras, all 331.7 million sensor values match LibRaw's."
---

ShootFlow is the open-source photo pipeline in this repository. It ingests a card, scores and culls
the frames, and develops raw files into 16-bit masters overnight. It has read Panasonic's RW2 files
since yesterday, but only the 2009-2015 layout. A G9, GH5S, S1, S1R, S1H or S5 file was refused
with "convert to DNG". Today those files are read directly too:

    shootflow develop P1033119.RW2 --dcp "Panasonic DC-S1 Adobe Standard.dcp"

## Four layouts, found by asking the files

Each RW2 says how its sensor data is stored in tag 0x2D, RawFormat. We took one public CC0 frame
from each of 18 Lumix bodies made since 2017 on raw.pixls.us and read that tag:

| RawFormat | bodies |
| --- | --- |
| 4 (the old one) | GH5, G90, G100, GX9, LX100 II, TZ200 |
| 5 | G9, GH5S |
| 6 | S1, S1R, S1H |
| 7 | S5 |
| 8 | GH6, GH7, G9 II, S5 II, S1 II, S9 |

The sizes gave most of it away. The S5's data is 1.78 bytes a sensel, which is 9 sensels of 14 bits
in each 16 bytes. Packing nine 14-bit values into a 128-bit little-endian number, lowest first, was
the first guess, and it was right: 0 of 24.3 million sensels differ from LibRaw. That is RawFormat
7.

RawFormat 5 has the same density, but read the same way every value came out wrong. It turned out
to be the same packing passed through the block shuffle of the old format. Panasonic stores data in
0x4000-byte blocks with the last 0x1FF8 bytes moved to the front. Undo that, and the G9's
82-megapixel high-resolution frame reads exactly.

RawFormat 6 (the S1 family) is the only one with real compression: 11 sensels in 16 bytes. Two
absolute 14-bit values come first. After them, groups of three 10-bit values each carry a 2-bit
shift code, and each value steps from the previous value of the same column parity. LibRaw reads
this format; our decoder is written independently and checked against it. 0 of 96 million sensels
differ across the three S-series frames.

## The fix nobody asked for: the camera's own crop

Six of the bodies use the old RawFormat 4 and already read sensel for sensel. The GH5 frame still
came out wrong, though. LibRaw cropped it to 3888 x 3888 and we cropped it to 5184 x 3888. The
photographer had shot at 1:1. Panasonic writes that framing in tags 0x2F-0x32, and we only read
the sensor borders. The GX9 (1:1) and TZ200 frames had the same problem. The camera's crop now
wins when it is present.

## The white point, measured instead of assumed

On RawFormat 6 and 7, LibRaw puts white at 16319, 64 levels under the 14-bit ceiling. Our first
version used the hard clip instead: 16368 on the S1 (the decoder takes 15 off every value), 16383
on the S5. The draft write-up even said no sensels sat in between. Then we counted them before
publishing:

| frame | at the hard clip | from 16320 to just under it |
| --- | --- | --- |
| S1 | 32,128 | 152,552 (144,576 at 16352-16355) |
| S1H | 32,128 | 144,576 |
| S1R | 54,376 | 247,563 |
| S5 | 72,701 | 5 |

On the S1 family, a saturated photosite doesn't land on one value. It lands on several, from 16320
up. With white at 16368, those 144,576 sensels would sit just under white, and after white-balance
scaling a blown sky would come out faintly tinted. LibRaw's margin catches all of them. We use it
now, and the white level matches LibRaw on every file.

## The check

On 12 bodies, every one of 331.7 million sensels equals LibRaw 0.22's. So do the as-shot white
balance, black level, colour pattern, crop and white level. The optional C decoder takes 0.06-0.7 s
a file. The pure-Python reference gives the same values on the S1, S5 and GH5S. Rows and method:
`ventures/photo-editing/eval/panasonic-rw2-newer-2026-11-15.md`.

## Not done

RawFormat 8, the Huffman layout of the GH6, GH7, G9 II, S5 II, S1 II and S9, is still refused with
a pointer to Adobe's DNG Converter. Public files of all six are on raw.pixls.us, so they are the
next test set. Colour is only as good as the camera profile you supply.
