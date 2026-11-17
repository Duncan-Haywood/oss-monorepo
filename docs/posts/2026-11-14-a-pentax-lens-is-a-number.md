---
title: "A Pentax lens is a number"
seo_title: "Reading Pentax lens numbers from the maker note for lens correction"
date: 2026-11-14
tags: [photography, raw, pentax, lens-correction, lensfun, maker-notes, open-source, photo-editing]
description: "Pentax files name no lens, only the number the lens reports. ShootFlow now reads it, checked against ExifTool, and remembers the lens you name once."
---

ShootFlow, the open-source photo workflow in this repository, corrects lens distortion, lateral colour and vignetting with profiles from [lensfun](https://lensfun.github.io/). To pick a profile it has to know which lens took the frame. Today's earlier changes taught it to work that out from [Canon's](2026-11-14-a-lens-with-no-name.md), Nikon's and [Olympus's](2026-11-14-the-lens-an-olympus-file-hides.md) private maker notes, and from [the copy Adobe's converter keeps in a DNG](2026-11-14-the-maker-note-a-dng-keeps.md). Pentax was still a blank.

## No name anywhere

Five Pentax interchangeable-lens files were checked, from the 2003 *ist D to the 2018 K-1 Mark II. Not one writes the EXIF lens name or the four-number lens specification most makers now include. The only thing a Pentax file says about its lens is a pair of numbers in the maker note: the "series" and "model" the lens reports through its contacts. Next to them sit the lens codes, bytes the lens sends the body, which give the focal length and the widest aperture at that focal length.

ShootFlow now reads them. Pentax bodies use three maker-note headers ("AOC", "PENTAX" and, for the Ricoh GR III, "RICOH"), with different starting points and, in the oldest, pointers counted from the start of the file. Pentax's own DNGs keep the note in a private block, and Adobe-converted ones in another. The layouts and formulas come from [ExifTool](https://exiftool.org/)'s documentation of them.

| file | lens number | lens's focal length / EXIF | widest f-number at the shot |
|---|---|---|---|
| K10D (ExifTool's test file) | 3 44 | 10.0 / 10 mm | 3.9 |
| K-1 Mark II raw | 8 227 | 170 / 170 mm | 4.0 |
| K-1 Mark II JPEG | 8 227 | 60 / 60 mm | 4.0 |
| 645D | 13 18 | 55 / 55 mm | (not sent) |
| *ist D | 4 24 | 77.5 / 77 mm | 1.8 |

On the K10D file all four values match ExifTool's own decode. On the rest, each focal length matches the one in EXIF, and the apertures fit the lenses those numbers belong to: a constant f/4 across a 60-250 mm f/4 zoom, f/1.8 on a 77 mm f/1.8.

## A number is not a name

ExifTool turns these numbers into names with a hand-built table of about 400 lenses. ShootFlow doesn't copy it. The table is ExifTool's own work under its own licence, and a number doesn't always mean one lens: the K10D's "3 44" means "a Sigma or Tamron lens", and several share it.

So ShootFlow remembers instead. A photographer owns a handful of lenses. Develop one frame with `--lens` and `--lens-memory lens-memory.json`, and the lens is stored under the number the body reported. Every later frame with that number gets the same profile, with a note saying where it came from. A frame whose number isn't in the memory yet is refused with that instruction, where before it got "names no lens". The two K-1 Mark II frames show how it works: name the lens on the 170 mm raw, and the 60 mm JPEG is corrected with no flag. The same memory settles Canon's ties. Canon's lens type numbers are shared, so a frame whose focal range fits two lensfun profiles is refused. Name it once, and later frames from that lens use the memory. The overnight pipeline reads the shoot's memory file too.

Two cases are still not covered. The 645D's 55 mm lens has no lensfun profile, and the Q-S1's "02 Standard Zoom" has none either. The memory can't fix a missing profile. Pentax's 91-byte and 80-byte lens-information layouts (K-5, K-30 and similar) also have no real test file yet. Details and the check script: `ventures/photo-editing/eval/pentax-lens-memory-2026-11-14.md`.
