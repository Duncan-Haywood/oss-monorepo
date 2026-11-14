---
title: "The maker note a DNG keeps"
seo_title: "Reading the camera maker note inside an Adobe-converted DNG"
date: 2026-11-14
tags: [photography, raw, dng, lens-correction, lensfun, canon, open-source, photo-editing]
description: "Adobe DNG Converter moves the camera's maker note into a private block. ShootFlow now reads it there, checked against ExifTool on a real Canon DNG."
---

ShootFlow, the open-source photo workflow in this repository, picks a lens correction profile from [lensfun](https://lensfun.github.io/) by working out which lens took the frame. Today's earlier changes taught it to read the lens from three makers' private notes: Canon's CameraSettings, Nikon's lens tag and [Olympus's Equipment block](2026-11-14-the-lens-an-olympus-file-hides.md). There was a catch. ShootFlow develops DNG files, and most DNGs from interchangeable-lens cameras come out of Adobe DNG Converter, which does not copy the camera's maker note to where EXIF keeps it. All three readers worked on the camera's own raw files and on none of the files ShootFlow can develop.

## Where the converter puts it

The note is not thrown away. It goes into a DNG tag called DNGPrivateData. The DNG specification says only that this block must start with a maker's name and should keep its offsets inside itself. Adobe's own block, as [ExifTool](https://exiftool.org/) reads it, is a list of named records. The `MakN` record holds three things:

| bytes | what |
|---|---|
| 2 | the original file's byte order, `II` or `MM` |
| 4 | where the note sat in the original file (big-endian) |
| rest | the maker note, byte for byte |

That middle field matters. Canon's maker note, and Olympus's oldest one, point to their values by counting from the start of the original file, not from the start of the note. Copied out alone, those pointers aim at nothing. So ShootFlow rebuilds just enough of the original file: a TIFF header in the old byte order, empty bytes up to the old position, then the note. The pointers land where they used to.

## Checked on a real file

ExifTool ships a real converted DNG from a Canon EOS 350D in its test suite, together with its own decode of it. The DNG's EXIF has no maker note; its private data has an 8,346-byte `MakN` record from offset 700. Read through the rebuilt header, the note gives a 18-55 mm lens, f/4 wide open at the shot's 55 mm, and an unknown lens type. ExifTool's decode says the same three things.

It does not name the lens. Seven Canon 18-55 mm zooms in lensfun admit f/4 at that range, so ShootFlow still lists them and asks for `--lens`, as it did before. The change is that it now has the camera's own account of the lens to work from. A DNG whose standard tag says `18-55mm f/?` now takes the f-numbers from the maker note when the note gives the same range. A tag with f-numbers still wins. Five camera-native DNGs and an iPhone DNG read exactly as before.

What is still missing is a converted Nikon or Olympus DNG. None turned up in the three public test corpora searched. Those two paths are tested on notes built the way the real NEF and ORF notes are laid out, but not yet on a real converted file.

The details and the before/after table are in `ventures/photo-editing/eval/dng-maker-note-2026-11-14.md`.
