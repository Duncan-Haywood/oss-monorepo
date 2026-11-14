---
title: "The last single-threaded step in a raw develop"
seo_title: "Threading raw sensor normalisation in numpy: 5x faster, same bytes"
date: 2026-11-14
tags: [photography, raw-processing, dng, numpy, performance, open-source, photo-editing]
description: "ShootFlow's DNG developer threaded everything but its first step, turning sensor counts into light. Banding it made it 5x faster, same bytes."
---

ShootFlow is the open-source photo pipeline in this repository: ingest, cull, a DNG and Canon CR2 developer, grading. Its developer has two engines, pure Python and numpy, and a test that holds them to the same output byte for byte. Yesterday's work put the numpy engine's demosaic, colour and encode on a thread pool in 256-row bands. One stage was left out, and it was the first one: sensor normalisation.

That step takes the raw counts off the sensor and turns them into light on a 0-to-1 scale. It looks each count up in the camera's linearisation table if there is one, subtracts the black level for that sensel's colour phase plus any per-row and per-column black offsets, scales by the white level, clamps, and counts how many sensels hit the clip point. On a 16-megapixel Leica T frame that took 0.24 s on one thread, about a quarter of an unwarped four-core develop.

## Why it could be banded

Every output sample depends only on its own count and on terms fixed by its row and column. So the rows can be cut into bands and each band done on its own, as long as two things hold:

- **The phases come from the image's row, not the band's.** Black levels repeat every two rows on a Bayer sensor and the white caps alternate by row. A band that starts on row 257 has to use row 257's phase. Get this wrong and every odd-height band shifts its colours.
- **Lens-shading maps still see the whole plane.** Phones write GainMap opcodes that scale rectangles of the image. A rectangle can cross a band edge, so when a file carries them the stage runs in two banded passes with the maps applied once on the whole plane in between.

An earlier session wrote the change and stopped before measuring it. This run picked it up, measured it, and seeded four faults to check the tests would notice: phase taken from the band's row for the caps, for the black level and for the row offset, and clip counts overwritten instead of summed. The tests caught all four, failing 36 to 72 subtests each.

## What it bought

On the same Leica T DNG, four CPUs, best of three:

| | before | after |
|---|---:|---:|
| normalisation, 1 thread | 0.243 s | 0.125 s |
| normalisation, 4 threads | 0.242 s | 0.050 s |
| full develop, no lens warp | 0.93 s | 0.70 s |
| half-size review still | 1.14 s | 0.74 s |

The output hashes are the same before and after at one, two and four threads, and so is the clip count (168,822 sensels). It also got twice as fast on one thread, because the old code built three full-size float64 copies of the frame and walked each one whole, while a 256-row band stays in cache.

A photographer culling a card of raw files sees the half-size still most often. It now takes about two thirds of the time it did.

The measurements, script and raw output are in `ventures/photo-editing/eval/normalised-plane-bands-2026-11-14.md`. What is still on one thread is the lossless-JPEG read of compressed files, where only the tile placement is threaded so far.
