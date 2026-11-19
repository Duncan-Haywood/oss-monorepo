---
title: "Canon's tiled CR3s were on the older cameras: 39 raw files, 21 bodies, checked against LibRaw"
seo_title: "Canon CR3 from the EOS R, M50 and 90D: tiles and old C-RAW"
date: 2026-11-18
description: "We guessed the R5 wrote tiled CR3s. It didn't. The EOS R, RP, M50, 90D and R100 do, and our reader refused all of them until today."
tags: [photo-editing, raw, canon, cr3, evaluation]
---

ShootFlow, the overnight photo pipeline in this repository, reads Canon's CR3 raw files itself, so a photographer doesn't have to run Adobe's DNG Converter first. Canon's CRX codec can cut a frame into tiles. On 15 November we wrote a reader for tiled files without having one to test. We guessed that Canon's widest sensors, the R5 class, would use tiles. This morning real R5 and R5 Mark II files came in as one tile each. So the question stayed open: which cameras actually write tiles?

## The survey

raw.pixls.us keeps public-domain sample raws from most cameras. We took one or two CR3s from every Canon body there that we hadn't checked yet, 39 files from 21 cameras, and read each one with ShootFlow and with LibRaw 0.22.2. LibRaw is an independent decoder that most open-source raw tools use. The check compares every sensor value, the white balance, the black level and the colour filter layout.

## What came back

- **The tiles are on the older cameras.** All 17 tiled files come from the 2018 to 2023 generation: the EOS R, RP, M50, M50 Mark II, M6 Mark II, M200, 250D, 90D, 850D and R100. Each stores the frame as two tiles side by side. The later bodies store one tile, even the R5 Mark II at 8480 sensels across. The R7 (one tile) and the 90D (two) have the same 7128-sensel width, so tiling follows the camera generation, not the sensor size.
- **Our reader refused 17 of the 18 files from those cameras.** Their RAW files leave the "several tiles" flags in the codec header at zero. We had treated that as a damaged file, but LibRaw works out the grid from the tile sizes alone. Their C-RAW files, the smaller lossy setting, use an older layout. It has no grid of quantisation values, just one fixed step per wavelet band, packed into a word of the band's header with its quantiser and padding.
- **After the fixes, every sensor value matches.** That's 0 differences in 986.8 million sensels across all 39 files, from both of our decoders where we ran both, and the white balance matches on every file. These are the first real tiled CR3s the reader has read, and they agree with the layout it was built from.

## A black-level bug in both readers

Two readings of the same file can disagree about where black sits. Get it wrong and every shadow is lifted or crushed. Canon states the black level in a table, and where that table puts it depends on the camera. We had looked it up by the table's length. But one length, 3,778 entries, hides two layouts, and the table's first entry, its version, tells them apart. With the version used too, an EOS R50 C-RAW file's black went from 13 levels too high to within 2 of LibRaw. Before the fix, a tone five stops under middle grey on that file came out 16% too dark.

The same split catches LibRaw out. On the new R6 Mark III and PowerShot V1, LibRaw 0.22.2 reports a black of 0 to 145, depending on the colour channel. The camera states 512 in two places, and the covered pixels at the sensor's edge read 512.0, column after column. ShootFlow uses 512. A developer that trusted LibRaw's figure would leave true black hundreds of levels above zero, a coloured veil over every shadow.

## What's still open

No camera here stores tiles one above another, the layout where our C-RAW reader and LibRaw still disagree at the seam rows. The older C-RAW header also has a per-line quantisation flag that no file here sets. Both readers refuse what they haven't seen, with a reason, rather than guessing.

The full table, the header dump and the commands to reproduce it are in `ventures/photo-editing/eval/canon-cr3-every-body-2026-11-18.md`.
