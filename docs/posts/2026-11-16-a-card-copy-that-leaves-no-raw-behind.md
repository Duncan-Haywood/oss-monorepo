---
title: "A card copy that only took the raws it could develop left 6 of 71 behind"
seo_title: "A card copy that left 6 of 71 raw files behind, and the fix"
date: 2026-11-16
tags: [photo-editing, raw, ingest, leica]
description: "ShootFlow's card copy skipped raw formats it could not develop. It now takes 27, lists what it leaves, and develops Leica RWL files."
---

ShootFlow, the open-source overnight pipeline for photographers, starts every shoot
by copying the card with checksums. Until today that copy took only the ten raw
formats the developer can read. Anything else was skipped without a word.

That is the wrong way round for a copy. A developer that can't read a file can
say so later, and the photographer can convert it to DNG. A copy that skips a
file loses it when the card is formatted. The copy's own last line said "review
ingest_manifest.json before formatting the source card", and the manifest did
not name the skipped files.

## How many were skipped

The public test corpus
[drewnoakes/metadata-extractor-images](https://github.com/drewnoakes/metadata-extractor-images)
has 71 camera raw files. Checked by extension, the old list left 6 of them on the
card: two Leica `.RWL`, two Sigma `.X3F` Quattros, a Canon 10D `.CRW` and a
Kodak `.DCR`. It also skipped HEIF and Canon's `.HIF` stills, an `.M2TS` clip and
four XMP sidecars, which hold edits someone already made.

## What changed

- The copy now takes 27 raw formats whether or not they develop, plus HEIF/HIF,
  MXF and M2TS video and XMP sidecars.
- Every other file it leaves on the card is listed as `left_on_card` in the
  preview, the result and the manifest. Hidden files and the card's own
  housekeeping files aren't listed.
- It no longer copies the `._IMG_0001.CR3` files a Mac writes onto an exFAT card.
  They are 4 KB of Finder metadata with a raw's extension. Before, they were
  copied, catalogued as photos and then failed at the develop step.
- Cull reads the new formats from the JPEG preview the camera embeds. Five of the
  six skipped files now score as keepers. The Kodak file has no preview and is
  listed as unreadable, with the reason.

## Leica RWL develops

Leica's D-LUX, V-LUX and C-LUX cameras are built by Panasonic and write a
Panasonic RW2 file under another name. Both real RWL files went through the
existing RW2 reader. Against LibRaw 0.22, every one of 32.7 million sensor values
matched, and so did the white balance, black level, colour pattern and crop.
So `.RWL` now develops like any RW2.

One small fix came out of it. Leica writes its model as `LEICA D-LUX (Typ 109)`
and Adobe's profile says `Leica D-LUX (Typ 109)`. Every develop printed a false
"profile is for another camera" note. Names are now compared the way the
profile chooser compares them, ignoring case and spacing.

## Not done

CRW, NRW, X3F and the other new formats are copied and culled but don't develop
yet. The `left_on_card` list was tested on synthetic cards, not a real card dump.
Details: `ventures/photo-editing/eval/leica-rwl-and-card-formats-2026-11-16.md`.
