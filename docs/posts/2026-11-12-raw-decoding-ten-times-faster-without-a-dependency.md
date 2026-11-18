---
title: "Decoding raw photos ten times faster, still with no dependency"
seo_title: "Fast lossless JPEG (DNG, CR2) decoding in Python with ctypes"
date: 2026-11-12
tags: [photography, raw, dng, performance, python, open-source]
description: "ShootFlow now decodes a Canon CR2's 22 million raw samples in about a second instead of nine, through an optional C reader. Same samples as LibRaw."
---

Most raw photos store their sensor data as lossless JPEG. A phone's DNG does, Adobe's DNG
Converter does, and a Canon CR2 keeps its whole sensor in one such stream. So the speed of
that decoder sets how fast ShootFlow, our open-source shoot-to-delivery pipeline, can develop
almost any real raw file.

Yesterday's work got the decoder from 17 seconds to about 9 on a 22-million-sample Canon
stream. That came from two changes: a two-pass design, and numpy for the prediction step.
What remained was the Huffman bit reader, about 85% of the time. It is a loop with one table
look-up per sample. Python cannot make that loop much faster.

## A C function without a C dependency

ShootFlow runs on the Python standard library alone, and we wanted to keep it that way. So
the new reader is about 40 lines of C kept as a string inside the Python module. The first
time a raw file needs it, ShootFlow compiles it with the C compiler already on the machine
(`cc`, which every Mac with the command line tools and most Linux boxes have). The library is
cached in `~/.cache/shootflow` and loaded with `ctypes`. Nothing is downloaded and there is
no wheel to build. With no compiler, on Windows, or with `SHOOTFLOW_NATIVE=0` set, the old
Python loop runs and gives the same answer.

The C side reads the stream through one 65,536-entry table per component. Each entry maps a
16-bit prefix to a code length and a size, so even the longest codes need no slow path. If it
meets anything odd, such as an invalid code, it hands the scan back to the Python loop. That
way errors are reported exactly as before.

## Checked, and measured

| | pure Python | with the C reader |
| --- | --- | --- |
| Canon 5D Mark II CR2, 22.0 M samples | 8.8-11.7 s | 1.2-1.7 s |
| the same, on the path `shootflow develop` takes | about 9 s | 0.7-1.1 s |
| a 256 x 256 DNG tile | 17 ms | 1.3 ms |

Every one of the decoder's 345 encoder test cases gives identical samples on both readers.
They cover all seven predictors, one to four components, restart markers, 16-bit codes and
byte stuffing. On the real Canon file the result matches LibRaw's `raw_image` sensel for
sensel: 0 of 22,032,768 differ. The C call itself takes 0.48 s, or 22 nanoseconds a sample.
Most of what is left is Python building a list for the public API.

It has only been run on Linux so far (gcc 13). macOS builds with `-dynamiclib`, which we have
not run, and Windows uses the Python path. The details and the steps to reproduce it are in
`ventures/photo-editing/eval/ljpeg-native-huffman-2026-11-12.md`.
