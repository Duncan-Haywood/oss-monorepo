---
title: "A 2003 Canon raw file, read sensel for sensel without converting it first"
seo_title: "Develop Canon CRW files (10D, 300D, G5) without DNG Converter"
date: 2026-11-16
tags: [photo-editing, ventures, raw, canon]
description: "ShootFlow now reads Canon CRW files from 15 bodies of 2000-2004 directly. On 20 real files every sensor value matched LibRaw 0.22."
---

[ShootFlow](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/photo-editing) turns a card full of raw photos into graded 16-bit masters on your own machine. This morning its card copy learned to keep raw formats it could not develop, so a 10D's `.CRW` was no longer left on the card. The grade still stopped at that file and asked you to run it through Adobe's DNG Converter first. Now it reads the file itself.

## What a CRW is

From 2000 to 2004 Canon's cameras wrote CIFF, the Camera Image File Format. That covers the EOS D30, D60, 10D and 300D (the first Digital Rebel), and the PowerShot G2 to G6, Pro1 and S30 to S70. A CIFF file is not a TIFF like almost every later raw format. After a 26-byte header comes a heap: data, then a table of 10-byte records, then a pointer back to the table. A record can hold another heap.

The sensor data is the first record. Canon coded it much like a JPEG, without the cosine transform. The sensor is cut into blocks of 64 values in reading order. Each block is a run-length list of differences sent through one of two Huffman trees, and there are three pairs of trees to choose from. Two running values, one for even columns and one for odd, restart at 512 at the start of every row. The first difference of each block carries over from the block before. That gives 10 bits per value. The 12-bit bodies keep the two lowest bits of every value uncompressed at the front of the record, four values to a byte. Nothing in the file says whether those low bits are there. dcraw's test, which LibRaw kept, scans the first 16 KB of the stream: Canon's coder always follows a 0xFF byte with 0x00, so a 0xFF followed by anything else means those bytes are not coded data.

## Checked against LibRaw

raw.pixls.us holds 51 files named `.CRW`. 21 are real CIFF files. The other 30 are mostly CHDK dumps: headerless sensor data that hacked PowerShots write under the same extension. With the 10D file from the metadata-extractor sample set, that makes 22 CIFF files. The two cyan-magenta-yellow-green bodies in the set (the G1 and the Pro70) are refused with that reason, since the developer has no four-colour path.

On the other 20 files, from 15 bodies (16 model names: the Digital Rebel is the 300D sold in North America), every one of 114.0 million sensor values equals what LibRaw 0.22 reads. They cover all three tree pairs, 10-bit and 12-bit. The colour filter layout matches on all of them. Black level is within 2 of LibRaw's everywhere.

The one real bug came from a shortcut. ShootFlow's CR2 reader takes the black level from the masked columns left of the picture, and on the EOS bodies that worked. On the PowerShots it read 40 to 680 where the true value is 32 to 128. The SensorInfo record's picture area starts 20 to 30 columns in, and only the first dozen of those columns are masked. The rest see light. SensorInfo carries a second rectangle that fixes this: four truly dark columns, 2340 to 2343 on the G2. Reading the black level there brought every body within 2.

## White balance is not always in the file

Eleven of the files record the white balance the camera used, and ours matches LibRaw's on all eleven. Three different records hold it, depending on the body's generation. On the EOS D60, 10D and 300D, the Auto levels sit in a ColorBalance record, with presets after them. The G2, S30 and S40 store the levels for the shot directly. The later PowerShots keep only a table of presets, and the shot's white-balance setting says which line to use. When those cameras were on Auto, nothing in the file says what Auto chose. Nine of the files are like that. LibRaw falls back to its own estimate for them. ShootFlow applies no white balance and says so in the develop report, so you know to set one.

## What's still open

- Colour needs a `.dcp` profile for the camera, such as the ones Adobe's DNG Converter installs. None was at hand here, so colour was not judged.
- The EOS bodies clip near 4,000 of 4,095. None of these frames had enough clipped sensels for the reader to measure that level, so a blown sky on a 10D may render slightly off-white.
- At 2 to 4 seconds a file in pure Python, there was no case for a C decoder.

The measurements are in `eval/canon-crw-reader-2026-11-16.md`, and the check is `tools/crw_libraw_check.py`. The [camera RAW formats page](https://marisstella.app/photo-editing/camera-raw-formats.html) lists every format ShootFlow reads and the real files each was checked on.
