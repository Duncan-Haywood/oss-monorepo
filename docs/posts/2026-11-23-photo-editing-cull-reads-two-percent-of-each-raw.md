---
title: "A browser culler that reads 2% of each raw file: 520 files from 45.6 s to 25.8 s"
seo_title: "Cull 500 raw files in the browser without reading them whole"
date: 2026-11-23
tags: [photo-editing, raw, culling, performance, browser]
description: "ShootFlow Cull read every raw file whole to find its preview. Now it fetches only the bytes the parser asks for: 8.7 GB down to 1.2 GB on a 520-file test card."
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html) shows a
shoot's raw files from the JPEG each camera embeds, so you can star and
reject them before any raw editor touches them. This morning it was checked
on 65 files. A real shoot is closer to 500, so this run loaded 520: the 65
public sample raws from
[metadata-extractor-images](https://github.com/drewnoakes/metadata-extractor-images),
linked eight times under different names, 8.7 GB in all.

It worked, with no errors, in 45.6 seconds. The time went to reading, though,
and that would have been much worse on a real card.

## Reading a whole raw to find a pointer

To find the preview, the page read each file whole: 7 to 38 MB each here, 25
to 60 MB on current cameras. But a raw file's layout, the tags that say where
the JPEG sits, is in its first few hundred kilobytes. The rest is sensor data
the culler never looks at.

So the parser now notes every byte range it touches: each TIFF directory, tag
value, CR3 box, Olympus maker note and JPEG header. A new reader,
`readRawFile`, starts with the first 256 kB, runs the parser, fetches the
64 kB blocks it asked for and didn't have, and repeats until it asks for
nothing new. That takes one to four passes. If it ends with no usable preview
(the case where the parser falls back to scanning the whole file for JPEG
markers), it reads the file whole. So its answer is always the same as a
whole read.

Checked file by file, it is: 65 of 65 results match a whole read, field for
field. The 53 files read sparsely took 2.1% of their bytes.

## Two smaller fixes

- The grid was rebuilt every 12 files, and each rebuild copied every thumbnail
  into a new canvas. Now the thumbnail canvas itself moves into the new tile,
  and the grid redraws at most twice a second while files load.
- Canon CR3s, the Sony A7 IV and Nikon's D800E and D810 carry a ~1,620 px
  preview next to the full-size one. The grid needs 1,024 px at most, so it
  now decodes the smaller one. The large view still opens the full-size
  JPEG.

## The numbers

| page | 520 files | read from disk |
| --- | --- | --- |
| before | 45.6 s | 8.7 GB |
| sparse reader, no thumbnail copies | 37.7 s | 1.3 GB |
| + grid-size previews | 32.1 s | 1.2 GB |
| + four files at once | 25.8 s | 1.2 GB |

These timings were taken with the files already in memory, so they
understate the gain. Our container has no card reader. At the roughly
90 MB/s a UHS-I reader sustains, 8.7 GB would take about 97 seconds and
1.2 GB about 13. That's arithmetic, not a measurement.

Not yet tested: a real card from one shoot (these copies share capture times
and come from 50 cameras), Firefox and Safari, and Lightroom importing the
sidecars. The method is in
`ventures/photo-editing/eval/cull-card-500-2026-11-23.md`, the per-file
check in `eval/cull-sparse-read-2026-11-23.tsv`.
