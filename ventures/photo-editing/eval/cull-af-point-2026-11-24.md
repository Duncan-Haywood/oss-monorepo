# Cull page: the camera's AF point, read from the maker note (2026-11-24)

The browser cull page ranked bursts by Laplacian detail in the busiest of 16
cells, and its own help said the flaw: a soft subject in front of a sharp
background wins. Cameras record where they focused. `site/rawpreview.mjs` now
reads it (`meta.af`) and the page uses it: red boxes in the large view for the
points the camera reports in focus, `Z` zooms to 100% there, "sharpest" in a
burst means most detail at the AF point when every frame has one, a sort by
detail at the AF point, and `af_x, af_y, af_detail, af_source, sharpest_by`
in the CSV.

## What is read

| Maker | Tag | Layout (ExifTool's tables) |
| --- | --- | --- |
| Canon CR2, CR3 | AFInfo2 0x26 (most bodies since ~2008), AFInfo 0x12 (older) | point boxes in px from the centre of an AF image, Y up; AFPointsInFocus bits; CR3 from the CMT3 box. The R8 lists 1,053 points (4,419 values), past the old 4,096-value cap, so the array is read directly |
| Sony | FocusLocation 0x2027, FocusLocation2 0x204a | full-size width, height, focus x, y |
| Fujifilm | FocusPixel 0x1023 | x, y in the frame of the JPEG whose EXIF holds the note (EXIF 0xa002/0xa003) |
| Panasonic | AFPointPosition 0x4d | two rationals, fractions; 0xffffffff/256 = none |
| Olympus, OM System | CameraSettings 0x2020 → AFAreas 0x304 | up to 64 boxes, bytes left, top, right, bottom in 255ths |
| Nikon | AFInfo2 0xb7 version 0100, live view only | phase-detect points are numbered on per-body grids with no published coordinates, so they are not placed |

## Check 1: against an independent decoder (22 of 22 agree)

The sample set ships metadata-extractor's own text dumps
(`<format>/metadata/java/<file>.txt`). `eval/cull-af-point-reference.py`
turns its decoded tag values into frame fractions and compares:

```
file  reference  ref x,y  ours x,y  max diff
arw/Sony ILCE-7M3 (A7M3).arw  Sony 0x2027  0.359,0.500  0.359,0.500  0.0000
arw/Sony ILCE-7M4 (A7M4).ARW  Sony 0x2027  0.472,0.669  0.472,0.669  0.0000
cr2/Canon EOS 350D.CR2  Canon AFInfo  0.858,0.500  0.858,0.500  0.0000
orf/Olympus E-M10.orf  Olympus 0x0304  0.496,0.498  0.496,0.498  0.0000
orf/Olympus E-M5.orf  Olympus 0x0304  0.500,0.494  0.500,0.494  0.0000
orf/Olympus E-PL7.orf  Olympus 0x0304  none  none  agree
orf/Olympus E-PM1.orf  Olympus 0x0304  0.500,0.494  0.500,0.494  0.0000
orf/Olympus E30.orf  Olympus 0x0304  none  none  agree
orf/Olympus E410.orf  Olympus 0x0304  0.765,0.498  0.765,0.498  0.0000
orf/Olympus E600.orf  Olympus 0x0304  0.373,0.500  0.373,0.500  0.0000
orf/Olympus PEN E-P3.orf  Olympus 0x0304  0.500,0.494  0.500,0.494  0.0000
orf/Olympus Pen E-PL1.orf  Olympus 0x0304  0.349,0.700  0.349,0.700  0.0000
orf/Olympus TG-4.orf  Olympus 0x0304  none  none  agree
orf/Olympus TG-6.ORF  Olympus 0x0304  none  none  agree
orf/Olympus XZ1.orf  Olympus 0x0304  none  none  agree
raf/FujiFilm EX-2.raf  Fujifilm 0x1023  0.501,0.501  0.501,0.501  0.0000
raf/FujiFilm FinePix S5500.raf  Fujifilm 0x1023  0.500,0.500  0.500,0.500  0.0000
raf/Fujifilm X-E1.raf  Fujifilm 0x1023  0.500,0.500  0.500,0.500  0.0000
rw2/Panasonic DMC-GF1.rw2  Panasonic 0x004d  none  none  agree
rw2/Panasonic DMC-GF3.rw2  Panasonic 0x004d  0.500,0.500  0.500,0.500  0.0000
rw2/Panasonic DMC-GF7.rw2  Panasonic 0x004d  0.500,0.500  0.500,0.500  0.0000
rw2/Panasonic Lumix DMC-LX7.rw2  Panasonic 0x004d  0.500,0.500  0.500,0.500  0.0000
# 22 of 22 files agree with metadata-extractor
```

The "none" rows are files where the camera recorded no position (Panasonic
GF1: 0xffffffff; five Olympus bodies with an empty AFAreas): the page shows no
AF point and falls back to the busiest cell, as before.

## Check 2: does the point sit on detail? (median rank 0.89)

metadata-extractor does not decode Canon AFInfo2 or the CR3 note, and a wrong
sign or frame would still be internally consistent, so
`eval/cull-af-point-detail.py` asks the photos: the Laplacian variance in a
window at the AF point (6% of the width, or the AF box), ranked among the same
window slid over a 24 × 16 grid of the preview. An in-focus frame's AF point
should land on edges.

```
file  source  x  y  in_focus  rank  rank_mirrored
arw/Sony ILCE-7M3 (A7M3).arw  Sony FocusLocation  0.359  0.5  1  0.927  
arw/Sony ILCE-7M4 (A7M4).ARW  Sony FocusLocation  0.472  0.669  1  0.471  
cr2/Canon EOS 350D.CR2  Canon AFInfo  0.858  0.5  1  0.984  
cr2/Canon EOS 600D.CR2  Canon AFInfo2  0.424  0.558  1  0.943  0.672
cr2/Canon EOS 70D.cr2  Canon AFInfo2  0.313  0.5  0  0.763  
cr2/Canon EOS 7D.cr2  Canon AFInfo2  0.5  0.5  0  0.406  
cr3/IMG_0036.CR3  Canon AFInfo2  0.404  0.537  1  0.924  0.958
cr3/IMG_0041.CR3  Canon AFInfo2  0.368  0.682  1  0.615  0.133
cr3/_MG_0039.CR3  Canon AFInfo2  0.404  0.463  1  0.76  0.193
cr3/_MG_0045.CR3  Canon AFInfo2  0.242  0.345  1  0.995  0.474
orf/OM Sytem OM-1.orf  Olympus AFAreas  0.435  0.48  1  0.945  
orf/Olympus E-M10.orf  Olympus AFAreas  0.496  0.498  1  0.701  
orf/Olympus E-M5.orf  Olympus AFAreas  0.5  0.494  1  0.956  
orf/Olympus E-PM1.orf  Olympus AFAreas  0.5  0.494  1  0.935  
orf/Olympus E410.orf  Olympus AFAreas  0.765  0.498  1  0.891  
orf/Olympus E600.orf  Olympus AFAreas  0.373  0.5  1  0.62  
orf/Olympus PEN E-P3.orf  Olympus AFAreas  0.5  0.494  1  0.997  
orf/Olympus Pen E-PL1.orf  Olympus AFAreas  0.349  0.7  1  0.893  
raf/FujiFilm EX-2.raf  Fujifilm FocusPixel  0.501  0.501  1  0.276  
raf/FujiFilm FinePix S5500.raf  Fujifilm FocusPixel  0.5  0.5  1  0.299  
raf/Fujifilm X-E1.raf  Fujifilm FocusPixel  0.5  0.5  1  0.875  
rw2/Panasonic DMC-GF3.rw2  Panasonic AFPointPosition  0.5  0.5  1  0.893  
rw2/Panasonic DMC-GF7.rw2  Panasonic AFPointPosition  0.5  0.5  1  0.997  
rw2/Panasonic Lumix DMC-LX7.rw2  Panasonic AFPointPosition  0.5  0.5  1  0.43  
# 24 files with an AF point; median rank of detail at the point 0.892 (0.5 = no better than a random spot); 16 of 24 in the top quarter
# Canon Y sign: rank as read 0.943, mirrored 0.672
# Canon Y sign: rank as read 0.924, mirrored 0.958
# Canon Y sign: rank as read 0.615, mirrored 0.133
# Canon Y sign: rank as read 0.760, mirrored 0.193
# Canon Y sign: rank as read 0.995, mirrored 0.474
```

18 of 24 points rank above the middle. The low ones are plain targets the
camera did lock on: the A7 IV's point is on hazy cloud just above a sea
horizon (0.47), the X-E2 and S5500 centre points sit on overcast sky and
snowy slope (0.28, 0.30), the LX7 on a screen of small text (0.43). The 7D
reports no point in focus (its centroid is of the selected points, rank 0.41).

**Canon's Y sign.** ExifTool documents Y as positive up; the check agrees.
On the five Canon files whose point is off the centre line, the point as read
ranks above the same point mirrored top to bottom in 4 of 5 (0.94 vs 0.67,
0.62 vs 0.13, 0.76 vs 0.19, 0.995 vs 0.47; the R8's 0036 is 0.92 vs 0.96,
a scene with detail in both places). On the 600D sunset, the six in-focus
points are on the tree line and the two not in focus are in open sky; with Y
down they would swap.

## Check 3: the page reads the same thing from a sparse read

The page reads only the byte ranges the parser asks for. Every maker-note
range goes through the same `need()` bookkeeping:

```
52 of 52 same (43 read sparsely)
```

In Chromium (Playwright) the page loaded all 52 raws (809 MB, 93 MB read) in
2.1 s with no console errors; the Sony A7 III frame (orientation 8) shows its
point on the skeleton's rib after rotation, the R8 frame shows its in-focus
cluster on the handwriting it focused on, and the CSV carried the points.

## Reproduce

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
(cd mei && git sparse-checkout set arw cr2 cr3 nef orf raf rw2)   # includes */metadata/java
node eval/cull-af-point.mjs mei OUT > OUT/af.jsonl
python3 eval/cull-af-point-reference.py mei OUT/af.jsonl
python3 eval/cull-af-point-detail.py OUT/af.jsonl                 # numpy, Pillow
```

## Open

- Nikon phase-detect points: needs a per-body grid (point number to
  position), e.g. measured from live-view frames with a known point.
- Sony bodies before the A7 III (NEX-5N, NEX-7, A5000, A500 here) write no
  FocusLocation; the encrypted 0x9400 block may hold one.
- Whether ranking by AF-point detail picks the frames a photographer keeps:
  needs a real burst-heavy card with their picks.
