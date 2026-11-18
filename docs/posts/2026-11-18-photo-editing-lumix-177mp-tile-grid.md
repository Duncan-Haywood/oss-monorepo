---
title: "The Lumix S1R II's 177 MP frames: one tag held two numbers, and LibRaw can't open them either"
seo_title: "Lumix S1R II 177 MP RW2: the tag that held two numbers"
date: 2026-11-18
tags: [photo-editing, raw, panasonic, file-formats]
description: "A search for Panasonic RW2 tone curves found none in 35 files. It did find a 4 x 2 tile grid that both our reader and LibRaw refused, and why."
---

ShootFlow develops Panasonic's current raw format, RawFormat 8, which every
Lumix since 2022 writes. When it [landed three days ago](../../ventures/photo-editing/eval/panasonic-rw2-format8-2026-11-15.md)
it read ten public files exactly as LibRaw does, but it refused one thing on
purpose: a file whose tone-curve tags (0x39 and 0x3A) are not the identity. No
file at hand had a curve, so there was no way to check what one means.

This run went looking for a file with a curve, and there isn't one. raw.pixls.us
holds 35 RawFormat 8 files from nine bodies (GH6, GH7, G9 II, S1 II, S1 II E,
S1R II, S5 II, S5 IIX, S9). Fetching only the first 64 KB of each is enough
to read the header, so the survey cost about 2 MB instead of 3 GB. Every
file has the identity curve, and none has per-symbol shifts or starting
values. The refusal stays, and that item is off the list: no public file
can test it.

**Three bodies nobody had checked.** The S1R II, S5 IIX and S1 II E weren't
in the earlier ten. On nine files, including the S1R II's 12-bit mode, its
65:24 crop and its multiple-exposure frame, plus the S5 II's and S9's 96 MP
modes, all 462.0 M sensels match LibRaw 0.22.2. So do the white balance,
black level, CFA, crop and white level.

**One frame failed in both readers.** The S1R II's 177 MP high-resolution
frame (16296 x 10856) stopped ours with "tile 4 does not fit", and LibRaw
0.22.2 stopped with an I/O error. It is the only public file that stores its
frame in two rows of tiles (4 x 2). The tag that gives each tile's left edge
read 0, 4656, 8448, 12080 for the first row and 369,098,752 for the start of
the second. That number is 0x16000000, and its high half is 5632, the height
of the first row of tiles. The tag holds `(top << 16) | left`. A single row of
tiles always has top 0, which is why the field looked like a plain left edge
on every file seen before.

The reader now splits the field. It also refuses a tile whose stored top
disagrees with the heights of the tiles above it, so a corrupt file fails
loudly instead of drawing one row of tiles over another. The frame reads in
3.05 seconds.

**Checking it with nothing to compare against.** LibRaw can't open this
file, so a sensel-by-sensel comparison isn't possible. The new
`tools/rw2_grid_check.py` scores the decode in two ways instead:

- At every tile edge it compares the step between same-colour sensels that
  straddle the seam with the median step nearby. The 177 MP frame's four
  seams score 0.98 to 1.07. Files LibRaw confirms score 1.03 to 1.17, and
  swapping one block of the frame on purpose pushes the score to 19 to 46.
- It ranks each tile against the camera's own 1920 x 1280 preview. Seven of
  eight tiles score 0.80 to 0.97. One scores 0.60, and the swap drops it to
  0.19, so this check sees a wrong tile too. The 0.60 looks like the scene
  rather than the decode, since that tile's seams are clean, but that is a
  judgement, not a measurement.

The C decoder and the pure-Python reference also agree on the first 48 rows
of all eight tiles.

What's still open: a sensel-by-sensel check of that frame against a second
decoder, once one can open it. Measurements and raw rows are in
[`eval/panasonic-rw2-format8-grid-2026-11-18.md`](../../ventures/photo-editing/eval/panasonic-rw2-format8-grid-2026-11-18.md),
and the format-by-format list is on the
[camera raw formats page](https://marisstella.app/photo-editing/camera-raw-formats.html).
