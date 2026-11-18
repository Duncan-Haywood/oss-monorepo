---
title: "The Lumix S1R II's 177 MP frame, checked by a second decoder: 176.9 million sensels, none different"
seo_title: "Lumix S1R II 177 MP RW2 checked against LibRaw's snapshot"
date: 2026-11-18
tags: [photo-editing, raw, panasonic, file-formats]
description: "LibRaw's November snapshot opens the S1R II's tiled 177 MP RW2 that its release refused. Every sensel matches ShootFlow's reader."
---

This morning ShootFlow learned to open the Panasonic Lumix S1R II's
high-resolution frames ([the earlier post](2026-11-18-photo-editing-lumix-177mp-tile-grid.md)).
These are 16296 x 10856 sensels stored as a 4 x 2 grid of compressed tiles. The
one public sample is `P1000450.RW2` on raw.pixls.us. At that point nothing else
could open it. LibRaw 0.22.2, which every earlier RW2 check was compared
against, refused it. So the decode was judged by indirect checks: smooth seams
at the tile edges, our C and Python decoders agreeing, and the embedded preview.
Those checks are strong evidence but not proof.

## A second decoder

LibRaw's git master has a newer RawFormat 8 path than its releases (snapshot
202611, dated 4 November). It builds from source in about 30 seconds. A small
helper, `tools/libraw_dump.cpp`, writes out its raw sensels and metadata, and
`tools/libraw_dump_check.py` compares them with ours, field by field. It runs the
same comparison the rawpy-based check has made on every other raw format.

The result: **all 176,909,376 sensels match**. So do the as-shot white balance
(R/G 1.836, B/G 2.105), the black level (512), the CFA (RGGB), the in-camera crop
(16288 x 10848 at 4, 4) and the white level (16319). Two files the old release
already confirmed match the snapshot too: a normal S1R II frame and an S5 II
96 MP frame. With one sensel flipped in the dump, the check fails at that
sensel. ([Full write-up](../../ventures/photo-editing/eval/panasonic-rw2-177mp-libraw-snapshot-2026-11-18.md).)

## Why the release refused it, and where the two decoders differ

LibRaw 0.22.x models RawFormat 8 as at most five vertical stripes, each the full
height of the sensor. A second row of tiles cannot pass that test. The
snapshot replaces the stripes with a real tile grid. It finds each tile's top by
adding up the heights of the tiles above it. It never reads the top from the
file: the tag holds `(top << 16) | left`, and LibRaw stores it in a 16-bit
field, which keeps only the left edge.

ShootFlow reads both halves and refuses a tile whose stored top disagrees with
the sum of the heights above it. On every real file the two numbers agree, so
both decoders produce the same sensels. On a damaged file they would part ways:
LibRaw would place the tile by its heights, and ShootFlow would stop and say why.

## What is still open

Adobe DNG Converter on the same frame would make a third reader, and it needs a
machine that has it. Colour for the S1R II still needs its camera profile, as for
every RW2.
