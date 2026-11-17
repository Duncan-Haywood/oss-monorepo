---
title: "Four numbers that name a lens: LensSpecification, Nikon's maker note and lensfun"
date: 2026-11-14
tags: [photo-editing, shootflow, raw, lensfun]
description: "When a raw file names no lens, its focal range and f-numbers at both ends pick one lensfun lens half the time. ShootFlow now uses them for any maker."
---

Lens correction needs a lens name. Plenty of raw files don't have one: an old Nikon writes none into
EXIF, and a camera-written DNG may skip it. [An earlier post today](2026-11-14-a-lens-with-no-name.md)
covered Canon, whose maker note gives the lens's focal range and one f-number. ShootFlow now does the
same for every maker, using a tag most cameras already write.

## The tag

EXIF 2.3 added **LensSpecification**: four numbers, the shortest and longest focal length, then the
widest f-number at each end. A Sony FE 24-105mm F4 writes `24, 105, 4, 4`; a kit 16-50mm writes
`16, 50, 3.5, 5.6`. DNG has the same four values as **LensInfo**. Older Nikon bodies don't write the EXIF
tag, but every Nikon maker note we looked at (seven NEFs, D70 to D810) has an unencrypted tag 0x0084 with
the same layout. Nikon's better-known LensData tag is encrypted, and we didn't need it.

Two f-numbers carry more information than Canon's one. Canon reports the widest aperture *at the focal
length you shot*, so f/4 fits both an f/4 zoom and an f/3.5-5.6 zoom of the same range. With both ends,
those two no longer tie.

## How often four numbers are enough

We took every lens in lensfun's database whose name states its range (1,119 lenses) and asked: given
only these four numbers and a body on the lens's own mount, how many lenses fit?

| hint | one lens fits | tie (refused) | true lens missed |
|---|---|---|---|
| both f-numbers | 560 (50.0%) | 559 | 0 |
| one f-number (Canon's kind) | 522 (46.6%) | 597 | 0 |

The ties are mostly versions of one lens (VR and VR II) and third-party lenses with the same range. In
those cases ShootFlow refuses and lists the candidates, since you know which one you own and it doesn't.

On real files that also name their lens (Sony A5000, A7 III, A7 IV, NEX-5N, NEX-7, Samsung NX1), the
four numbers alone found the same lens three times out of six and refused the other three. It never
picked a different lens. Two Nikon frames with an 18-70mm, which name no lens, came out as the AF-S DX
18-70mm f/3.5-4.5G.

## Where it stops

A tag is only used when lensfun knows the camera, because without the camera's mount the search would
cover every mount. A fixed-lens camera keeps its own lensfun entry. "Only one fits" means only one in
lensfun, so a lens lensfun doesn't have could be mistaken for one it does; the report names the lens it
used and tells you to pass `--lens` if that's wrong.

The measurements, the file list and the code are in
`ventures/photo-editing/eval/lens-specification-2026-11-14.md`.
