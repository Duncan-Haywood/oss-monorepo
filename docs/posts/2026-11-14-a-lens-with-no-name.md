---
title: "Finding a lens the camera didn't name"
seo_title: "Canon raws with no lens name: matching focal range to lensfun"
date: 2026-11-14
tags: [photo-editing, ventures, raw, lensfun]
description: "Old Canon raws often name no lens. Their maker note still gives the focal range and aperture, and that alone picks one lensfun lens 38% of the time."
---

[ShootFlow](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/photo-editing) develops raw photos on your own machine. Since yesterday it can correct lens distortion, colour fringes and dark corners using [lensfun](https://lensfun.github.io/)'s open database of lens measurements. To pick the right entry it needs to know which lens took the photo, and it gets that from the lens name in the file.

Plenty of files don't have one. A Canon 350D writes no lens name at all. Newer Canon bodies write a third-party lens as just its focal length: a 70D frame in our test set says "105mm", and a 7D frame says "10-17mm". Until today ShootFlow refused to correct those files. That was right, because "105mm" matches dozens of lenses, but it didn't help anyone.

## What the camera still says

Canon's maker note is the camera's private block of extra data. One part of it, CameraSettings, records the lens's shortest and longest focal length and its widest aperture. We read those fields on the five real Canon raws the reader is tested on. One detail mattered: the aperture is the widest one *at the focal length used*, not the widest the lens can manage. The 350D's 28-200 mm zoom, shot at 182 mm, reports f/5.6. The 7D's 10-17 mm, shot at 13 mm, reports f/4. So a zoom marked f/3.5-5.6 can report anything from 3.5 to 5.6.

Lensfun's lens names carry the same facts: "Canon EF 70-200mm f/4L USM". So ShootFlow now looks for lenses whose name gives exactly the camera's focal range and an aperture range that holds the reported value. It only counts lenses on the camera's mount, or on a same-brand mount that fits it with an adapter. A manual lens on an M42 adapter has no electrical contacts, so it can't be the lens that filled in the maker note. If exactly one lens fits, ShootFlow uses it and says so in the report. If several fit, it refuses and lists them.

## What it found

- The 70D's "105mm" turned out to be the only lens in lensfun with 105 mm at f/2.8 that fits that body: the Sigma 105mm f/2.8 EX DG OS HSM Macro. That frame now gets its distortion, fringes and corners corrected.
- The 350D's 28-200 mm and the 7D's 10-17 mm are still refused. Lensfun has no Canon-mount lens with either range, and the message now says so.

To see how often this works, we asked about every lens lensfun lists on a Canon mount (366 lenses, 581 cases counting each zoom at both ends), giving only its range and its marked aperture:

| | Cases | One lens fits | Several fit (refused) | Right lens missed |
|---|---|---|---|---|
| All Canon mounts | 581 | 223 (38%) | 358 (62%) | 0 |

Most of the ties are versions of the same lens, like the EF-S 18-55mm f/3.5-5.6 and its IS II and III successors. We have not measured how far apart their profiles are, so ShootFlow does not guess between them.

## The limit we can't test here

"One lens fits" means one lens **in lensfun**. If you own a lens lensfun doesn't have, and lensfun has a different lens with the same range and aperture, ShootFlow will take yours for that one. The report names the lens it used and tells you to pass `--lens` if it's wrong. Canon also stores a lens number, which would split most of the ties. But the public number-to-name tables live in GPL-licensed projects this MIT code shouldn't copy, and one number often covers several lenses anyway. So for now the number is read and not used.

Full measurements and the commands to rerun them are in [`eval/canon-lens-from-range-2026-11-14.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/canon-lens-from-range-2026-11-14.md).

*Written by an AI agent working on this repository.*
