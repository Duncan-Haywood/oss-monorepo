---
title: "Fujifilm X-Trans raw files, without the converter"
seo_title: "Reading Fujifilm RAF and X-Trans raw files directly, against LibRaw"
date: 2026-11-14
tags: [photography, raw, fujifilm, raf, x-trans, demosaic, open-source, photo-editing]
description: "ShootFlow now develops Fujifilm RAF files itself, X-Trans included. Every sensel matches LibRaw on three bodies; the colour layout is stored backwards."
---

ShootFlow, the open-source photo workflow in this repository, develops raw files into 16-bit masters. This morning it read DNG and the raw files of seven makers. Fujifilm was not one of them, so anyone shooting Fujifilm had to run every file through Adobe's DNG Converter first. Now `shootflow develop DSCF0001.RAF --dcp FOLDER` reads the RAF itself, and so does the overnight pipeline's grade stage.

Fujifilm took more work than the others, because most of its X bodies do not use a Bayer sensor.

## A 6x6 pattern

Nearly every camera sensor has a Bayer filter: red, green, green and blue in a 2x2 square, repeated. Fujifilm's X-Trans repeats every 6x6 sensels instead. Each block of 36 has 20 green, 8 red and 8 blue, placed so that every row and every column holds all three colours. Fujifilm's argument is that the less regular layout causes less moiré.

ShootFlow's developer assumed 2x2 throughout. It refused any other pattern. Its demosaic, the step that estimates the two missing colours at each sensel, looked at the 3x3 neighbourhood and averaged the sensels of each missing colour. The highlight caps and the half-size path assumed a 2x2 repeat too.

That demosaic carries over to X-Trans more easily than you might expect. Checked over all 36 positions of the layout, every 3x3 window holds red, green and blue. So the same averaging works if the pattern's period is a parameter, 2 or 6, rather than a constant. Two things did need new code:

- **The edge of the frame.** Cut a 3x3 window down to the 2x3 that fits at the edge, and on Bayer it still holds every colour. On X-Trans it sometimes doesn't. The standard-library path already borrowed the mirrored neighbours there. The numpy path now does the same, in the same order, so the two still give identical output bytes.
- **Half size.** On Bayer, each 2x2 block holds one of each colour, so half size just bins them. X-Trans 2x2 blocks don't, so half size on X-Trans demosaics at full size and then averages.

## The file

A RAF is not a TIFF. It starts with a fixed header that gives the model name and the offsets of three parts: an embedded JPEG, a list of Fujifilm records, and the sensor data. On the X-Trans bodies the sensor data comes wrapped in a small TIFF of Fujifilm's own tags: size, bit depth, 36 black levels (one for each position of the pattern) and the as-shot white balance. On the 2005 FinePix S5500 there is no wrapper, just the sensor values.

The 6x6 layout is one of the records, 36 bytes, and it is **stored backwards**. Read forwards, it matches neither real file. We checked that without leaning on another decoder. On the X-E2's picture area, we averaged each of the 36 positions over the whole frame and compared that with what the camera's own white balance predicts for the colour sitting there. Read backwards, the correlation is 1.000; read forwards, 0.087. On the X-E1 the figures are 0.836 and 0.036 (its scene is mostly red berries, which blurs the comparison).

## The check

The test files are the three RAFs in a public sample collection on GitHub: an X-E1 (12-bit, two sensels packed into three bytes), an X-E2 (14-bit) and a FinePix S5500 (Bayer). ShootFlow and LibRaw 0.22, the library behind most open-source raw tools, each read every file. All 37.3 million sensels were equal. So were the white balance, the black level at every pattern position, the white level and the colour layout. A file reads in 0.01 to 0.33 seconds. A 16-megapixel X-Trans frame develops in about 7 seconds with numpy.

The crop needed no per-camera measurement this time, unlike the Pentax reader earlier today. The header gives a picture area. We slid each camera's embedded JPEG over a render of the raw, corner by corner. On all three files the JPEG sits centred on that area, to within a pixel. On both X-Trans bodies the JPEG is the area minus 8 pixels on each side. LibRaw crops slightly differently: it moves an X-Trans crop onto the 6x6 grid. ShootFlow doesn't need to, because it crops after the demosaic.

## What it does not do yet

The X-Trans demosaic is bilinear. It is correct: flat fields stay flat, and on real frames the berries come out red and the leaves green. But it is softer and more prone to false colour than the directional demosaics made for X-Trans, such as Markesteijn's, which LibRaw and darktable use. That is the next step, measured against LibRaw on these same frames.

Fujifilm's lossless-compressed RAFs (X-T2 era and later) are refused with a message to convert them. So are SuperCCD files. We had no test file of either, and the reader does not guess at formats it has never seen. Colour is only as good as the camera profile you supply.

The code is MIT licensed: `ventures/photo-editing/src/shootflow/raf.py`. The full record of the check is in `eval/fujifilm-raf-reader-2026-11-14.md`.
