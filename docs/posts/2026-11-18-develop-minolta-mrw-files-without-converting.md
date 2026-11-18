---
title: "Minolta's last raw files, from the DiMAGE 7 to the Dynax 7D, read sensel for sensel"
seo_title: "Develop Minolta MRW files (DiMAGE A2, Dynax 7D) without DNG Converter"
date: 2026-11-18
tags: [photo-editing, ventures, raw, minolta]
description: "ShootFlow now reads Minolta and Konica Minolta MRW raw files directly. On nine bodies every sensor value matched LibRaw 0.22."
---

[ShootFlow](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/photo-editing) turns a card full of raw photos into graded 16-bit masters on your own machine. Its card copy has kept `.MRW` files since 2026-11-16, but the grade stopped at them and asked for Adobe's DNG Converter. From today it reads them itself.

## Whose files these are

Minolta merged with Konica in 2003, and Konica Minolta handed its camera business to Sony in 2006. The raw files of those last years are MRW: the DiMAGE 7, 7i and 7Hi, the A1, A2 and A200, and the Dynax 7D, which was also sold as the Maxxum 7D in America and the Alpha-7 Digital in Japan. The 7D was the first DSLR with in-body stabilisation, and its line became Sony's Alpha. Plenty of those files sit in archives, and the bodies still sell used.

## What an MRW is

Most raw formats are TIFF files with a maker's twist. An MRW is not. It opens with four bytes, a zero and `MRM`, then a length. The sensor data starts that many bytes later. Everything before it is a chain of named blocks:

- **PRD** says how big the sensor is, how the values are stored and which colour filter sits at the top-left corner. Two storage schemes turned up: 12-bit values packed two to three bytes, and, on the DiMAGE 7 family, plain 16-bit words.
- **WBG** holds the white balance the camera chose, as four gains.
- **TTW** is a complete TIFF file tucked inside: camera name, orientation, exposure details and a thumbnail.

The white-balance block has one trap. dcraw, the decoder most others descend from, reads it with an index trick and a special case for the DiMAGE A200. That camera's filter starts with green and blue, not red and green, and its gains come in that same order. So the rule needs no model name: the four gains follow the filter pattern the PRD block states.

## Checked against LibRaw

raw.pixls.us, a public CC0 collection of sample raws, has one file for each of ten Minolta bodies. Nine are real MRW files. The tenth, the DiMAGE Z2's, has no MRW header at all, and dcraw recognises it only by its file size. ShootFlow refuses that one with a reason rather than guess.

On the nine, every one of 54.1 million sensor values matched LibRaw 0.22. So did the colour filter layout, the black level (zero on every body) and the as-shot white balance. A file reads in 0.02 to 0.16 seconds.

The one thing that differs is the white level, the value where the sensor clips. LibRaw takes it from a table of camera models. ShootFlow finds it from the picture, as the pile of values where highlights clipped. Six frames had such a pile: on three the two agree exactly, on the A1 ShootFlow's is 6 levels lower, and on the A2 and A200 18 and 61 lower, so the brightest 0.5 to 1.5% clips a little early. That costs a sliver of highlight, but it never leaves a blown sky tinted pink. The three frames with nothing clipped fall back to the 12-bit ceiling, 4095; on the DiMAGE 7i and 7Hi that is above LibRaw's 3965, so a blown highlight from those two bodies would come out light grey rather than white. A table of models would fix that, and is not built yet.

## Through the whole develop

ShootFlow ships no camera colour profiles, and these old bodies need one: Adobe's free DNG Converter installs them. To test the whole develop without one, each file was developed with a stand-in profile built from LibRaw's own colour matrix for that camera. The average colour of every picture then sat within 0.017 of LibRaw's own render, in chromaticity, counting the pixels neither render clipped.

An earlier version of that test said the A200 was off by twice the limit. The frame is mostly saturated red, and the test was averaging values after the gamma curve, which bends a saturated average. Averaged in linear light, the gap is 0.003.

## Try it

```
cd oss-monorepo/ventures/photo-editing
PYTHONPATH=src python3 -m shootflow.cli develop PICT0001.MRW \
  --dcp ~/profiles --out masters
```

The [camera raw formats page](https://marisstella.app/photo-editing/camera-raw-formats.html) lists every format and camera checked so far. The full measurements are in the [MRW write-up](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/minolta-mrw-reader-2026-11-18.md).

*ShootFlow is free, MIT-licensed software. It is not affiliated with Minolta, Konica Minolta, Sony or Adobe. Check your masters before you delete anything from a card or an archive.*
