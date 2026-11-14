---
title: "A Lumix raw names its lens in the preview"
seo_title: "Reading the lens from Panasonic RW2 files for lensfun correction"
date: 2026-11-14
tags: [photography, raw, lens-correction, lensfun, panasonic, open-source, photo-editing]
description: "Panasonic RW2 files name no lens in their own EXIF; the embedded JPEG's maker note does. Reading it lets ShootFlow correct real Lumix frames with no flag."
---

ShootFlow, the open-source photo workflow in this repository, [reads Panasonic RW2 files directly](2026-11-14-panasonic-raw-files-read-from-the-top-down.md) since this morning. Every sensel on four real Lumix bodies matches LibRaw. One thing still failed: lens correction. Given lensfun's open database, ShootFlow said "the file names no lens" for every interchangeable-lens RW2 and asked for `--lens`.

## Where the lens isn't

An RW2 is a TIFF variant. Its first directory holds Panasonic's sensor tags, and it points to an EXIF directory in the usual way. On the GF1, GF3 and GF7 samples in [metadata-extractor's public test corpus](https://github.com/drewnoakes/metadata-extractor-images), that EXIF directory has focal length, f-number and the 35 mm equivalent. It has no LensModel, no LensSpecification and no maker note.

## Where it is

Tag 0x2E holds a full-size JPEG of the frame, which the camera made for its own screen. That JPEG carries the camera's complete EXIF, maker note included. Panasonic's maker note starts with `Panasonic\0\0\0`, then a directory whose offsets count from the JPEG's own TIFF header. Tag 0x51 in it is the lens's name, written the way Panasonic prints it on the barrel: `LUMIX G 20/F1.7`. Tag 0x52 is the lens's serial number.

So the reader now walks the embedded JPEG's markers to its Exif segment and reads that TIFF block with the TIFF reader it already had. It follows the EXIF pointer and opens the maker note. Any tag the RW2's own EXIF lacks is filled in from the JPEG's, and LensType becomes the lens name when nothing else names one.

Panasonic's spelling needed no translation. Lensfun matches names word by word, and it splits "20/F1.7" into 20 and 1.7. Its database even lists some Panasonic lenses under exactly these EXIF strings.

## Checked against two other readers

| body | lens name read (= metadata-extractor's) | lens picked (= compiled lensfun 0.3.4's first pick) |
|---|---|---|
| GF1 | LUMIX G 20/F1.7 | Lumix G 20mm f/1.7 Asph. |
| GF3 | LUMIX G 14/F2.5 | Lumix G 14mm f/2.5 Asph. (tied with the II, and the note says so) |
| GF7 | LUMIX G VARIO 12-32/F3.5-5.6 | Lumix G Vario 12-32mm f/3.5-5.6 Asph. Mega OIS |
| LX7 | none: a fixed-lens compact | its own lensfun camera entry, as before |

The serials match too. A developed GF7 frame, a tree-lined avenue shot at 12 mm, came out with straight path edges and its corners lifted by a stop.

The GF3's tie is honest. Panasonic's name for the 2010 14 mm has no word that sets it apart from the 2013 version II. The II writes "II" in its name, so a frame shot with it matches only the II. Both ShootFlow and lensfun's own library take the original lens here, which is right for a 2011 body, and ShootFlow's develop notes say it was a tie.

## Not covered yet

There was no Leica-branded Lumix file to test, and no GH5-era body. A maker note headed "LEICA" is skipped rather than guessed at. The details and the raw rows are in `ventures/photo-editing/eval/panasonic-rw2-lens-2026-11-14.md`.
