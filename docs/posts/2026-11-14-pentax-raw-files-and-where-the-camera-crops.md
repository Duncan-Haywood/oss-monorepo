---
title: "Pentax raw files, and where the camera really crops"
seo_title: "Reading Pentax PEF raw files directly, checked against LibRaw"
date: 2026-11-14
tags: [photography, raw, pentax, k-1-mark-ii, pef, open-source, photo-editing]
description: "ShootFlow now reads Pentax PEF files itself: all 36.6 million sensels of a K-1 Mark II frame match LibRaw, and the camera's JPEG is not centred."
---

ShootFlow is the open-source photo workflow in this repository. It copies a card with checksums, catalogues the shoot, scores and culls it, and develops raw files into 16-bit masters. By this morning it read DNG and the raw formats of Canon, Sony, Nikon, Olympus, Panasonic and Samsung. Pentax was worse off than any of them. `.pef` was missing from every extension list, so a Pentax card's raw files were never even copied at ingest.

Now they are. `shootflow develop IMGP0001.PEF --dcp FOLDER` reads the PEF itself, and so does the overnight pipeline's grade stage.

## The format

A PEF is a TIFF file. Its first image holds the sensor data, compressed with a scheme Pentax labels 65535. The scheme is a Huffman code of differences, close to lossless JPEG, with one twist: the code table is not fixed. Each camera writes its own table into a tag in its maker note. On the K-1 Mark II that table has 15 codes, 2 to 12 bits long, and together they fill every 12-bit prefix exactly. Each value is predicted from the sensel two columns to its left. The first two columns of a row are predicted from the same columns two rows up.

The black level and the as-shot white balance also come from the maker note. The colour filter layout comes from EXIF.

Pentax never published any of this. dcraw and LibRaw have read PEF files for years, and this reader follows what they do. The code is new, and LibRaw is the check.

## The check

The test file is the only PEF in a public sample collection on GitHub, a K-1 Mark II frame. ShootFlow and LibRaw 0.22 (through rawpy) both read it, and all 36,590,400 sensels were equal. That held for the C decoder (0.5 seconds) and for the pure-Python reference (32 seconds). The white balance, black level, white level and filter pattern were also equal.

The file confirms its own black level. The maker note says 1,024. The 196,388 masked sensels around the edge of the sensor, which never see light, average 1,026.

## Where the camera crops

The sensor stores 7,392 by 4,950 sensels. The camera's own full-size JPEG is 7,360 by 4,912. The first version of the reader assumed the JPEG was cut from the middle of the sensor, at column 16 and row 19.

That was a guess, so the next step was to test it. A small script slides the JPEG over the raw data and measures how well the two line up at each offset. Each 2x2 block of raw sensels holds one red, two greens and one blue wherever it sits, so averaging the block gives a brightness to compare with the JPEG without demosaicing first. The centred position scored a correlation of 0.63. The best position scored 0.88, at column 14 and row 28. Run on each corner of the frame separately, the script found that same shift in all four. So the JPEG is the raw frame shifted, with no scaling or lens correction in between.

The reader now crops the K-1 Mark II at (14, 28). That is nine rows lower than the centred guess. Because 14 and 28 are both even, the crop also keeps the filter pattern in the same phase. LibRaw uses a wider area from its own per-camera table: 7,376 by 4,932 at (6, 18). Both crops sit inside the part of the sensor that receives light.

## What is not done

- Only one real PEF was checked. Older bodies like the K10D, K-5 and K-3 use the same compression and the same maker note tag, but none of their files was tested.
- Uncompressed PEFs and Pixel Shift's four-frame files are refused, with a message to convert them to DNG.
- The measured crop exists only for the K-1 Mark II. Other bodies get the centred JPEG size, and the develop notes say so.
- Colour is only as good as the camera profile you supply. As with Canon, Sony, Nikon, Olympus, Panasonic and Samsung files, a PEF needs the camera's `.dcp` from Adobe's free DNG Converter.

The reader is `ventures/photo-editing/src/shootflow/pef.py`. The LibRaw check is `tools/pef_libraw_check.py`, and the crop measurement is `eval/pef_jpeg_alignment.py`. Everything is MIT licensed.
