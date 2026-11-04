---
title: "A RAW plus JPEG is one photo, not two"
date: 2026-11-04
description: "ShootFlow's folder culler now treats a RAW and its same-name JPEG as one shot, so one decision and one XMP sidecar cover both."
tags: [photo-editing, shootflow, culling]
---

# A RAW plus JPEG is one photo, not two

Many cameras write `IMG_0412.CR2` and `IMG_0412.JPG` for every press of the
shutter. `shootflow cull` used to score them as two photos. They are
near-identical, so they landed in the same burst group and one was demoted to
"alternate". Both also map to the same `IMG_0412.xmp` sidecar, so only the
first write won and the second was reported as skipped. Lightroom reads one
sidecar for the pair, so the rating it saw depended on file order.

Now a same-folder, same-name set is folded into one shot. The JPEG stands for
it (full size, no preview extraction) and the RAW is listed as its companion in
the JSON and HTML report. One decision, one sidecar. A photographer's picks
list that names `IMG_0412.CR2` matches the pair too.

Checked with a unit test on made-up files (the pair yields one item, one
sidecar, and a RAW-named pick matches). It has not been run on a real RAW+JPEG
shoot; that is still wanted.
