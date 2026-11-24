---
title: "Where your Nikon focused, read in the browser: 27 of 28 Z8 frames now show their AF point"
seo_title: "Nikon NEF AF points in a free browser culler"
date: 2026-11-24
tags: [photo-editing, nikon, autofocus, culling, metadata]
description: "ShootFlow Cull now places Nikon AF points from per-body maps. On 28 public Z8 raws it shows a point on 27, landing on detail at a median rank of 0.92."
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html) is a free
page for picking frames from a card of raw files. Nothing is uploaded. Since
this morning it has drawn the camera's AF point for Canon, Sony, Fujifilm,
Panasonic and Olympus files, and ranked a burst by the detail at that point,
so a soft subject in front of a sharp background no longer wins. Nikon files
were left out, and Nikon is the second-largest raw format on most cards.

## Why Nikon was missing

Canon, Sony and the others write where they focused as positions. Nikon's
maker note mostly doesn't. It names the points it used, by number and by bit,
on a grid that is different for each body: 51 points on a D800, 39 on a
D7000, 153 on a D850, 405 on a Z8 in auto-area. "Point 11" on a D810 is C5,
the point one column left of centre, and Nikon publishes no coordinates for
it.

Two open projects supply what is missing. ExifTool's Nikon tables give the
numbering (point 11 is C5). The Focus-Points Lightroom plugin, which is
Apache-licensed, ships a map of every point's position for each body,
measured by its users. A small script turns those maps into fractions of the
frame: 29 maps covering 43 models. The page reads Nikon's four AF record
layouts (D3-era DSLRs, the D5/D500/D850 family, the D6/D780 and first Z
bodies, and the Z8/Z9 generation) and places the points. Where a Z body
writes the AF area's position itself, the page uses that. The large view
draws the body's whole grid faintly, puts the used points in red and names
them in the status line.

## Does it put the point in the right place?

Two checks on files we didn't make.

**A photographer's card.** A public, CC0 set of 28 Nikon Z8 raws: landscapes,
buildings and a fishing rig, shot for HDR. Before this change the page placed
a point on 5 of them, the frames where the camera wrote coordinates. Now it
places one on 27. The other 22 are auto-area frames, where the camera reports
a cluster of 8 to 49 points on its 405-point grid. One frame records none.

For each frame we measured how much fine detail sits at the point and ranked
it against the same window slid across the whole picture. A point on the
subject should rank high. As a control we used the point turned through the
frame centre, which is roughly where a wrong map (a flipped axis, another
body's grid) would put it:

| | frames | median rank at the point | in the top quarter | beats the control |
| --- | --- | --- | --- | --- |
| all | 27 | 0.92 | 22 | 19 of 23 off-centre frames |
| placed from the grid | 22 | 0.92 | 18 | 15 of 18 |
| camera-written position | 5 | 0.93 | 4 | 4 of 5 |

Points placed from the grid rank as high as the camera's own coordinates.
19 of 23 is a 1-in-770 result if the point were no better than its mirror
image. On one frame the 16 red points sit on the reel the photographer
focused on.

**A second measurement.** ExifTool's notes give its own measured spacing for
Z8/Z9 points: 260 by 292 pixels. The plugin's map, measured by someone else,
spaces them 255 by 288. They agree within 2%.

## What we found on the way

Those Z8 files were shot in HLG tone mode, and their previews are HEVC
video frames, not JPEGs. The page reads JPEG previews, so on these files it
shows the 160 × 120 thumbnail and reads the whole 51 MB file looking for
something better. That was already happening before this change. For the
check above we decoded the 1620 × 1080 HEVC previews with ffmpeg. Doing the
same in the page, with the browser's own HEVC decoder where it has one, is
the next step.

Still not covered: Nikon's 11-point bodies (D90, D3000 to D3500, D5000,
D5100) and bodies from before 2007, which have no measured map. Those files
keep the old score, the busiest area of the frame.

Method, numbers and how to reproduce them:
`ventures/photo-editing/eval/cull-nikon-af-2026-11-24.md`.
