---
title: "The lens an Olympus file hides"
seo_title: "Finding the lens in Olympus ORF files that write no EXIF lens name"
date: 2026-11-14
tags: [photography, raw, lens-correction, lensfun, olympus, open-source, photo-editing]
description: "Olympus bodies from the E-1 to the first PENs write no standard lens tag. Their maker note still names the lens, in three layouts. Reading it identified eight real frames that gave nothing before."
---

ShootFlow, the open-source photo workflow in this repository, corrects lens distortion, lateral colour and vignetting from [lensfun](https://lensfun.github.io/)'s open database. To pick a profile it has to know the lens. Most cameras say so in EXIF: a LensModel string, or since EXIF 2.3 a LensSpecification tag with the focal range and the widest f-number at each end. [This morning's change](2026-11-14-four-numbers-that-name-a-lens.md) taught ShootFlow to match lenses from that tag alone.

Olympus files from the Four Thirds years and the first Micro Four Thirds bodies have neither. Of 18 real ORF files in [metadata-extractor's public test corpus](https://github.com/drewnoakes/metadata-extractor-images), six interchangeable-lens bodies (E-30, E-410, E-600, E-P3, E-PL1, E-PM1) carry no standard lens tag at all. ShootFlow saw "no lens" and stopped.

## Where Olympus put it

The lens is in the maker note, Olympus's private block inside EXIF. Tag 0x2010 leads to an "Equipment" directory: the lens's shortest and longest focal length, its widest f-number at each end, the widest at the focal length of the shot, and on most bodies a name. The f-numbers are stored in 256ths of a stop counted from f/1, `f = sqrt(2) ** (v / 256)`, so 925 means f/3.5.

Getting there was the work. Olympus has used three layouts:

| header | bodies | where the offsets count from |
|---|---|---|
| `OLYMPUS\0` + `II` + 3 | E-3 onwards, the PENs, the OM-Ds | the start of the maker note |
| `OM SYSTEM\0\0\0` + `II` + 4 | OM-1 onwards | the start of the maker note |
| `OLYMP\0` + version | E-1, E-300 era, compacts | the start of the whole file's TIFF header |

The old one is awkward: a maker note copied out on its own cannot be read, because its pointers aim at places in the file around it. And on the E-1 (from ExifTool's test images) the Equipment directory is not pointed to at all; its bytes sit inline as one opaque value, with their own pointers again counting from the file's header. So the TIFF reader now remembers where each value sat in the file, and the Olympus reader goes back to the file when it meets the old header. ORF files also open with "IIRO" where TIFF has 42, which the reader used to refuse.

## Range first, name only to break a tie

The focal range and end f-numbers go through the same matcher as LensSpecification: a lens is picked only if it is the one lensfun lens on the body's mount with that range. That works for the Four Thirds frames. It does not for the most common kit zoom: eight lensfun lenses are a 14-42 mm f/3.5-5.6 on Micro Four Thirds, Panasonic's included.

The Equipment name settles those. "OLYMPUS M.14-42mm F3.5-5.6 II R" is scored against the eight the way a file's lens name would be, and only among them, so a name can never pick a lens the range rules out. Four Thirds lenses report themselves generically ("OLYMPUS 14-54mm Lens"); a name like that matches nothing, and the tie stays refused with the candidates listed.

## What it found

| body | before | now | metadata-extractor's own decoder says |
|---|---|---|---|
| E-1 | no lens | Zuiko Digital 14-54mm f/2.8-3.5 | (not in its corpus) |
| E-30 | no lens | Zuiko Digital 14-54mm f/2.8-3.5 | Zuiko Digital 14-54mm F2.8-3.5 |
| E-410 | no lens | Zuiko Digital ED 14-42mm f/3.5-5.6 | the same |
| E-600 | no lens | Zuiko Digital ED 14-42mm f/3.5-5.6 | the same |
| E-P3 (ORF and JPEG) | no lens | M.Zuiko Digital 17mm f/1.8 (name broke a 3-way tie) | the same |
| E-PL1 | no lens | M.Zuiko Digital ED 14-42mm f/3.5-5.6 L (8-way tie) | the same |
| E-PM1 | no lens | M.Zuiko Digital ED 14-42mm f/3.5-5.6 II R (8-way tie) | M.Zuiko Digital 14-42mm F3.5-5.6 II R |

Eight frames from seven bodies, every pick the lens that an independent decoder names for the same file. The newer bodies (E-M5, E-M10, E-M1, OM-1) write both the Equipment directory and the EXIF tag; on all five files the two agree, so nothing changed for them. A manual lens on an E-PL7 writes zeros and still gets no hint, which is right.

## What it does not reach yet

ShootFlow develops DNG and Canon CR2 files, not ORF. An Olympus raw is developed after Adobe's DNG Converter, which usually writes the lens itself; the new reader serves the shot facts read from ORFs and camera JPEGs, and a future ORF developer. A converted DNG keeps the original maker note in a private block that ShootFlow does not open yet. That is the next step, along with Pentax, whose maker note gives a lens number but no range.

Code, tests and the full table: [`ventures/photo-editing`](../../ventures/photo-editing/), `eval/olympus-equipment-2026-11-14.md`.
