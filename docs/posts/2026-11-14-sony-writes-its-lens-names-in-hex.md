---
title: "Sony writes its lens names in hex"
seo_title: "Finding the lens in Sony ARW and Samsung SRW maker notes"
date: 2026-11-14
tags: [photography, raw, lens-correction, lensfun, sony, samsung, open-source, photo-editing]
description: "Three of ten real Sony and Samsung raw files name no lens in EXIF. Their maker notes do, and reading them settles three more range ties too."
---

ShootFlow, the open-source photo workflow in this repository, corrects lens distortion, lateral colour and vignetting from [lensfun](https://lensfun.github.io/)'s open database, and it has read Sony ARW and Samsung SRW raw files directly since this morning. To pick a lensfun profile it needs the lens. On the ten Sony and Samsung files in [metadata-extractor's public test corpus](https://github.com/drewnoakes/metadata-extractor-images), that went badly for six of them:

- the Sony DSLR-A500, Samsung Galaxy NX and Samsung NX20 write no EXIF lens name and no LensSpecification at all, so there was nothing to match;
- the NEX-5N, NEX-7 and A7 IV do write LensSpecification, but "24 mm f/1.8" fits three lensfun lenses on E-mount and "24-70 mm f/2.8" fits four. ShootFlow refuses to guess between them.

## Sony: eight bytes that spell the name

Sony's maker note has a tag, 0xB02A, that ExifTool calls LensSpec. It is eight bytes. On the A500 they are `01 00 18 00 55 35 56 02`.

The middle six read like decimal once you print them as hex: `0018` is 18 mm, `0055` is 55 mm, `35` is f/3.5 and `56` is f/5.6. A digit past 9 counts as ten and up, so `b0` is f/11. The first and last bytes are flags, read together as one 16-bit field (`0x0102` here), and each flag is one of the letters in Sony's own lens names: `0x0100` is DT, `0x0002` is SAM. Put them back in Sony's order and the eight bytes read "DT 18-55mm F3.5-5.6 SAM". That is the lens. ExifTool reads the A500's other lens tag, number 55, as the same lens or its Mark II.

The layout was published by [equational.org](http://equational.org/importphotos/alphalensinfo.html) and is what ExifTool reads; ShootFlow implements it from that description.

## Samsung: a number in a short list

Samsung's NX bodies keep a lens number in their maker note, tag 0xA003: 2 on both the Galaxy NX and the NX20. Samsung made only seventeen NX lenses with numbers, and metadata-extractor publishes the list under the Apache License: 2 is "Samsung NX 18-55mm F3.5-5.6 OIS". The range and f-numbers come out of the name.

Neither note has a header to recognise it by, so each is read only when the file's Make says Sony or Samsung. And they count their pointers differently: an ARW's note from the start of the file, an SRW's from the start of the note.

## The name breaks ties, the range decides

The range and f-numbers go through the same matcher as before: a lens is picked only when it is the one lensfun lens on that mount that fits. The name is used only to choose among lenses that already fit, the way an Olympus file's lens name is. It also works beside a file's own LensSpecification when the two agree on the range. That settles the NEX frames ("E 24mm F1.8 ZA") and the A7 IV, whose LensSpec has no bit for "GM" but does say "II", which is enough to pick the GM II out of four 24-70 mm f/2.8 lenses.

| | before | now |
|---|---|---|
| frames with no lens to match | 3 | 0 |
| frames refused as a range tie | 3 | 0 |
| frames whose pick, with the EXIF lens name dropped, matches that name (or an independent decoder) | 4 of 10 | 10 of 10 |

Ten files is a small sample, and it is the sample there is: every ARW and SRW in that corpus. The full table, and what is still not done (Sony's own in-file lens corrections, Sony's lens numbers), is in [the measurement note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/sony-samsung-lens-2026-11-14.md).
