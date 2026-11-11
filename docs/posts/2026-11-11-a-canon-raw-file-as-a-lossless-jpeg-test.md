---
title: "Testing a DNG decoder on a Canon raw file: 22 million sensels, zero differences, twice as fast"
seo_title: "Lossless JPEG (SOF3) decoder in pure Python checked on a real Canon CR2 against LibRaw"
date: 2026-11-11
tags: [photography, raw, dng, lossless-jpeg, python, performance, open-source]
description: "A Canon CR2 holds a lossless JPEG the camera wrote itself. ShootFlow's DNG tile decoder read all 22 million sensels exactly as LibRaw does, and a two-pass rewrite cut it from 16.8 s to 7.4 s."
---

Most DNG files from cameras, and from Adobe's free DNG Converter, store the sensor data as
lossless JPEG: the 1990s JPEG mode that keeps every bit (SOF3 in the standard). ShootFlow's
DNG developer has its own decoder for it, written in plain Python. Until today it had only
read streams that our own test encoder and ffmpeg had written. Real camera DNGs live on
sites that refuse connections from our build machine, so it had never seen one.

## A camera file that is a lossless JPEG inside

A Canon CR2 file is a TIFF, and its sensor data is one lossless JPEG that the camera encoded
itself. Canon first cuts the sensor into vertical slices and then encodes the slices one after
another. So the decoder that reads DNG tiles can read a CR2's sensor data unchanged, and
LibRaw's reading of the same file gives an answer to compare against.

We used the Canon 5D Mark II test file from rawpy's repository. Its stream is 23 MB: a
1448 x 3804 frame with four interleaved components, 14-bit samples, two Huffman tables and
the left-neighbour predictor. We decoded it with ShootFlow and put the three slices (1936,
1936 and 1920 columns) back side by side. Then we compared every value with LibRaw's
`raw_image`:

| check | result |
|---|---|
| sensels compared | 22,032,768 |
| sensels that differ from LibRaw | 0 |

The new tool `tools/cr2_ljpeg_check.py` runs this check on any CR2.

## Then make it faster

That decode took 17 seconds. The old decoder did one Python step per sample: read the
Huffman code, read the extra bits, look at the neighbours, add, mask. It is now split
into two passes, so each pass can lean on code that runs at C speed:

1. **Read every difference first.** The stuffed `FF 00` bytes are removed with one
   `bytes.replace`, the data is read as 32-bit words, and a 12-bit lookup table returns the
   Huffman code *and* its extra bits in one step whenever both fit.
2. **Then predict.** With the left-neighbour predictor, the one cameras use, each sample is
   the previous sample plus a difference. That makes each row a running sum, which
   `itertools.accumulate` computes in C. If the first difference of each row is rewritten so
   the sum restarts from the sample above, the whole component becomes a single running sum.
   Taking everything modulo 2^16 at the end gives the same answer as masking at every step,
   because this predictor only adds.

| stream | before | after |
|---|---|---|
| Canon CR2, 22 M samples, written by the camera | 16.8 s | 7.4 s |
| one 256 x 256 DNG tile (synthetic) | 52 ms | 19 ms |

The output is identical to the old decoder's on the Canon file and on 345 generated test
streams. Those streams cover all seven predictors, one to four components, codes longer than
the table, restart markers that do and don't fall on row boundaries, and the odd "size 16"
case. Each of six deliberately planted bugs failed between 37 and 308 of those tests.

What remains is the Huffman loop. It costs about 0.2 microseconds a sample, and a bigger
lookup table didn't help: the time goes to the Python interpreter itself, not to the table
lookups. Going faster would take native code. numpy can't help with this part, because each
code's position in the stream depends on the code before it.

## What it doesn't show

This checks the decoder, not the DNG layout around it. A DNG written by a camera or by
Adobe's converter, with its tiles and a Huffman table per tile, still hasn't been read here.
The details are in `ventures/photo-editing/eval/ljpeg-decoder-2026-11-11.md`.

ShootFlow is MIT-licensed and runs offline. It ingests a shoot, culls it, develops the DNGs
and makes the reels overnight on your own machine. The DNG developer needs only Python's
standard library.
