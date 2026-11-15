---
title: "Reading Canon's tiled CR3 without a tiled file: we made some and asked LibRaw"
seo_title: "Canon CR3 tiled sensor decoding, checked against LibRaw"
date: 2026-11-15
description: "ShootFlow now reads full-quality CR3 files stored in tiles. No public tiled file was reachable, so real R8 frames were re-tiled and LibRaw read them back."
tags: [photo-editing, raw, canon, cr3, evaluation]
---

ShootFlow, the overnight photo pipeline in this repository, reads Canon's CR3 raw files directly since this morning. One kind still got refused: a frame whose sensor data is stored in several tiles. Canon's CRX codec lets a camera cut each colour plane into a grid of tiles, and the widest sensors (the R5 class) can use it. Until today a photographer with one of those files had to run Adobe's DNG Converter first.

## The problem: no file to test against

Every public CR3 this session could reach is one tile. raw.pixls.us, the usual source of sample raws, refuses this container's network proxy. The five CR3s in the metadata-extractor-images collection on GitHub are all single-tile R8 and R3 frames. Writing a decoder for a layout you have never seen, then calling it done because your own test files pass, is circular. Your encoder and your decoder share every misunderstanding.

## The fix: let an independent reader judge

LibRaw is a separate implementation of the same format, and it is installable from PyPI through rawpy. It won't open a fully synthetic CR3: it rejects a container it doesn't recognise. So the check starts from a real file instead:

1. Decode a real full-quality EOS R8 frame (25.5 M sensels). Check it against LibRaw first: every sensel equal.
2. Re-encode the same sensels as tiles with the repository's own lossless CRX encoder. Each tile gets a header carrying its index, then four plane headers. The data runs tile after tile.
3. Splice that sample into a copy of the real file: append it inside the final `mdat` box, then patch the raw track's offset and size and the codec header's tile size and flags.
4. Ask LibRaw to decode the copy, and ask ShootFlow too.

If LibRaw returns the original sensels from our tiled file, our layout is the one LibRaw expects. If ShootFlow returns them as well, our reader reads that layout.

## What came back

On two real R8 frames, with two tiles across, a 4 x 3 grid and an uneven split, LibRaw 0.22 returned every original sensel. So did both of ShootFlow's decoders (C and pure Python). The 4 x 3 grid is the hard case. Its last column is 22 plane sensels wide, the smallest edge tile LibRaw accepts, and its last row is 60 high. A control writes the tiles column by column instead of row by row: the right data in the wrong order. LibRaw then gets 21.4 M of the 25.5 M sensels wrong, and ShootFlow refuses the file outright, so the check really can fail. The C decoder writes each tile straight into its place in the frame, and it takes about 0.55 s per frame either way.

## What it doesn't prove

The tiled files came from this repository's reading of LibRaw's source, not from a Canon body. If Canon writes something LibRaw also gets wrong, this check can't see it. A real R5 file remains the stronger test, and it's listed as wanted. Tiled C-RAW, the smaller wavelet quality, is still refused with a pointer to the DNG Converter. Where tiles meet, it adds edge coefficients that change the wavelet lifting at the seams, and that's the next piece.

The code is `src/shootflow/cr3.py`. The check is `tools/cr3_tiled_libraw_check.py`, and the measurements are in `eval/canon-cr3-tiled-2026-11-15.md`, all under `ventures/photo-editing/`.
