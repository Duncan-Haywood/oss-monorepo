---
title: "Canon C-RAW in tiles: read, checked against LibRaw, and a LibRaw seam bug found on the way"
seo_title: "Decoding tiled Canon C-RAW CR3, and a LibRaw seam bug"
date: 2026-11-16
description: "ShootFlow now reads C-RAW CR3 files stored in tiles. Side-by-side tiles match LibRaw exactly; stacked tiles exposed a misplaced test in LibRaw's decoder."
tags: [photo-editing, raw, canon, cr3, evaluation]
---

ShootFlow, the overnight photo pipeline in this repository, has read Canon's CR3 raw files directly since yesterday: full quality, the smaller C-RAW setting, and full-quality files whose sensor is stored in tiles, as the widest sensors (the R5 class) can do. One layout was still refused: **C-RAW in tiles**. It is the harder case, and today it is read.

## Why C-RAW tiles are harder

A full-quality tile is an independent picture. A C-RAW tile is a three-level wavelet decomposition (the reversible 5/3 filter from JPEG 2000), and that filter reaches across the seam. Canon's format handles this by giving each tile its own decomposition plus a few coefficients lent by its neighbours: one extra high-pass coefficient before a left (or top) neighbour, and after a right (or bottom) one up to two high and two low per level, from a 144-entry table indexed by the tile's size mod 8. With those coefficients the inverse runs straight across the seam, and each level rebuilds the next level's low band with its own borrowed edge. Each tile also has its own grid of quantisation steps.

## Checking it with no tiled file

No public tiled C-RAW is reachable from here, so we made some, as we did yesterday for full quality. A new tool takes a real one-tile C-RAW (two EOS R8 frames and an EOS R3), recomputes each tile's decomposition from the real sensels around it, keeps only values every input of which was real, cuts the bands to the tile plus its borrowed edge, splices the result into a copy of the real file, and asks LibRaw 0.22, an independent decoder, to read it.

Two codings per layout. With every quantisation step set to 1 the transform is lossless, so both readers must return the original sensels. With the file's own steps, the readers return a lossy picture and must agree with each other.

**Tiles side by side, the layout wide sensors use, agree exactly.** Two to five tiles across, with plane tiles from 22 sensels (the narrowest LibRaw allows) to 2,048, an odd width of 619, lossless and quantised: on every layout LibRaw and both of our decoders returned the same 25.5 M sensels, and the lossless ones equalled the original. The C decoder reads a tiled file as fast as a one-tile one, about 0.7 s.

## Where LibRaw and we part

**Tiles stacked one above another did not agree.** On the same R8 frame cut into two rows of tiles, LibRaw returned 160,305 sensels different from the original, all in the 13 rows next to the seam. Three rows of tiles gave 370,013. A 4 x 3 grid it refused to decode at all. Our reader returned every original sensel in all three.

Reading LibRaw's decoder showed one reason. In its inverse-transform step, the test "is there a tile below?" sits inside the test "are we at the tile's last rows?", so a tile with a neighbour below never computes its last rows, and a branch written for exactly that case can never run. The function that feeds it combines the same two tests, which is evidently what was meant. We rebuilt LibRaw with the tests combined: the upper tile then came back exactly. The first 8 rows of the lower tile still differ, and we could not trace that second difference in this session.

So side-by-side tiles are confirmed by an independent reader. Stacked tiles are read by the same seamless rule, but nothing independent confirms our seam rows yet, and ShootFlow adds a note to any frame stored that way. We have not reported the LibRaw issue upstream yet; the brace and its fix are written up in [the evaluation note](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/canon-cr3-craw-tiled-2026-11-16.md) with the files' recipe. If you own an R5-class body and can share a C-RAW frame, tiled files from the camera itself would settle both questions.

ShootFlow is open source and runs on your own machine. It is not affiliated with Canon or LibRaw.
