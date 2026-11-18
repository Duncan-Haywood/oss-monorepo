---
title: "Hasselblad 3FR without Phocus: ten bodies match LibRaw, and the H4D-60's shadows were wrapping"
seo_title: "Hasselblad 3FR reader: ten bodies equal to LibRaw"
date: 2026-11-18
tags: [photo-editing, raw, hasselblad, file-formats]
description: "ShootFlow now develops Hasselblad 3FR files directly, with no profile. On ten bodies every sensel matches LibRaw, and one body's noise wrapped past zero."
---

ShootFlow's card copy has kept Hasselblad `.3FR` files since 2026-11-16, but
its developer refused them. An H- or X-series shooter had to export each frame
through Phocus or Adobe's DNG Converter before the batch pipeline could touch
it. As of today the files develop directly.

**Ten bodies, every sensel.** raw.pixls.us (CC0) has one 3FR for each of ten
Hasselblad bodies and backs: the Ixpress CF132, the old CFV, H3D, H4D-60,
CFV-50c, X1D, X1D II 50C, CFV II 50C, X2D 100C and CFV 100C. On all ten, every
one of 561.5 M sensor values matches LibRaw 0.22, and so do the colour filter
layout and the as-shot white balance. The [check](../../ventures/photo-editing/tools/hasselblad_libraw_check.py)
and its [rows](../../ventures/photo-editing/eval/hasselblad-3fr-libraw-2026-11-18.jsonl)
are in the repository.

**Two layouts.** The X-series and the new backs write plain 16-bit words, and a
100 MP X2D frame reads in half a second. The H-series and older backs use
Hasselblad's own lossless compression. The file starts with a JPEG header, but
the data after it is not a JPEG scan. The bits come from little-endian 32-bit
words with no byte stuffing. Each pair of sensels takes two size codes and then
two differences, and each sensel is predicted from the same colour two columns
to the left. It's decoded in C, with a pure-Python reference that matches the C
version on real streams.

**No profile needed.** Every other maker's raw ShootFlow reads needs the
camera's `.dcp` profile for colour. A 3FR doesn't, because Hasselblad writes a
DNG-style ColorMatrix1 and AsShotNeutral into the file. On eight of the ten
bodies that matrix is the same nine numbers as Adobe's table in LibRaw. The two
100 MP bodies carry Hasselblad's own, slightly different one. With LibRaw's
colour method, the mean colour of each developed frame matches LibRaw's to four
decimal places on those eight bodies.

**The H4D-60's shadows wrapped.** One file failed on every sensel at first. The
H4D-60 stores black-subtracted values, and in the shadows its noise goes below
zero. A sensel at -3 is written as 65533, so read as stored, 0.5% of the frame
would develop as white specks in the darkest areas. LibRaw fixes this with a
model table: for an H4D-60 3FR it adds 256 and sets black to 256. ShootFlow
finds the problem in the data instead. Such a frame claims white 32767, puts
0.5% of its sensels in the top 256 codes, and has none at all in the 16,128
codes just below them. Real highlights never leave that gap. When it shows up,
the reader adds the 256 offset, and the file then matches LibRaw exactly. The
other nine files don't trip the test.

**A bug in our own check.** The first colour comparison showed gaps of up to
0.036 on three bodies, even though the sensels, white balance and matrix all
matched. The cause was the check, not the reader. LibRaw's default output
curve is BT.709, and the check undid it with the sRGB curve, which skews dark
frames channel by channel. With LibRaw asked for linear output, the gaps went
to zero. The Minolta MRW check from earlier today has the same mistake, so its
reported colour gaps are too large. That rerun is on the [list](../../ventures/photo-editing/NEXT.md).

Not yet read: Phocus `.fff` exports and multi-shot frames. Details are in the
[evaluation record](../../ventures/photo-editing/eval/hasselblad-3fr-reader-2026-11-18.md),
and the [format page](https://marisstella.app/photo-editing/camera-raw-formats.html)
lists every format and body checked.
