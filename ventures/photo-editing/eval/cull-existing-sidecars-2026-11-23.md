# The cull page and the ratings already on a card (2026-11-23)

Before today `site/cull.html` started every frame unrated and downloaded a fresh
sidecar per frame. Two things went wrong for a photographer who already has
metadata:

1. **Unzipping over Lightroom's sidecars destroyed the edits in them.** A
   Lightroom Classic or Camera Raw `IMG_0001.xmp` holds the develop settings
   (`crs:*`), crop, keywords and captions next to `xmp:Rating`. The page's zip
   held a 10-line `IMG_0001.xmp` with only a rating, so "unzip into the raw
   folder" replaced all of that.
2. **Ratings set earlier were invisible**: stars set in the camera, in
   Lightroom, Bridge, Photo Mechanic or darktable had to be set again.

## What changed

- `.xmp` files can be dropped or chosen with the raws (or later, on their own).
  `sidecarTarget` pairs `IMG_1.CR3.xmp` exactly and `IMG_1.xmp` with the one raw
  named `IMG_1.*`, and pairs nothing when two raws share the stem (`IMG_1.CR3`
  and `IMG_1.JPG`), since either could own it.
- `readXmp` reads `xmp:Rating` (-1 to 5, fractions rounded) and `xmp:Label` in
  attribute or element form, under whatever prefix the packet binds to
  `http://ns.adobe.com/xap/1.0/`.
- A frame's starting marks: what was marked on this page before (local storage),
  else its sidecar, else the rating the camera wrote into the raw.
- In-camera ratings: the XMP packet in TIFF tag 700, the XMP `uuid` box
  (`be7acfcb-97a9-42e8-9c71-999491e3afac`) of a CR3, else the Rating tag 0x4746.
  The packet's bytes are noted for the sparse reader, so it is fetched like any
  IFD.
- On download, a frame that came with a sidecar gets **that file back under its
  own name** with only `xmp:Rating`, `xmp:Label` and (when present)
  `xmp:MetadataDate` changed (`mergeXmpSidecar`); the rest is byte for byte. An
  empty label removes `xmp:Label`. A sidecar with no `xmp` namespace (darktable
  writes some) gets it declared on its first `rdf:Description`.

## Checks

**Unit tests** (`node --test site/rawpreview.test.mjs`, 28 pass with
usage.test.mjs): a Lightroom-shaped sidecar merged to 5 stars and Green is
identical to the original once the three properties are stripped from both;
keywords with escaped `&amp;` and `crs:` values survive; element forms
(`<xap:Rating>3.0</xap:Rating>`) are read and rewritten in place; tag 700 beats
the Rating tag, Nikon's default `Rating="0"` packet falls back to the tag; a
CR3 XMP box is read.

**The 65 public raws** (drewnoakes/metadata-extractor-images, the clone in
`eval/cull-page-previews-2026-11-23.md`; `node eval/cull-camera-ratings.mjs mei`,
`eval/cull-camera-ratings-2026-11-23.tsv`):

| | files |
| --- | --- |
| read whole and sparsely, same rating and label | 65 of 65 |
| an XMP packet found by an independent byte scan for `<x:xmpmeta` | 16 |
| a non-zero `xmp:Rating` in the bytes | 1 (Pentax Q-S1 DNG, 3) |
| rating the reader reports | 1 (Pentax Q-S1, 3) |

The 15 packets that say 0 or carry no Rating (Sony A7 III and A7 IV, Canon 600D
and 70D, the R3 and four R8 CR3s, DJI, Nikon D800E and D810, OM-1, TG-7) give no
rating, as they should. A separate stdlib walk of every TIFF raw's IFDs
(`python3 -I eval/cull-rating-tag-scan.py mei`,
`eval/cull-rating-tag-scan-2026-11-23.txt`) finds tag 0x4746 only on the OM-1 and
TG-7, both 0. So this set exercises the packet path on one real rated file and
the tag path on none with a rating; the tag path is covered by the unit test
only.

**In Chromium** (`eval/cull-sidecar-roundtrip.mjs`,
`eval/cull-sidecar-roundtrip-2026-11-23.json`): three raws (Pentax Q-S1, Nikon
D810, Canon R8 CR3) and a Lightroom-shaped `Nikon D810.xmp` (2 stars, Purple,
`crs:Exposure2012`, `crs:CropTop`). The status line said "1 marked from their .xmp
sidecars, 1 rated in the camera"; the tiles showed 3 stars, 2 stars and none.
After re-rating the D810 to 5 and Green from the keyboard, the zip held
`Nikon D810.xmp` and `Pentax QS1.xmp`; Python's `zipfile` read it, and a `diff`
of the D810 sidecar against the one dropped shows exactly three lines changed
(MetadataDate, Rating, Label). No page errors.

## Not done

- No Lightroom here: whether Lightroom Classic picks up the merged sidecar via
  Metadata > Read Metadata from Files is the Adobe XMP behaviour as documented,
  not observed. ExifTool, a second reader of the merged files, could not be
  installed in this session.
- Only one real raw with an in-camera rating; the Rating tag path has no real
  rated file. A card from a body rated in the camera (Sony, Canon, Fujifilm) is
  wanted.
- DNG and JPEG keep metadata inside the file; a sidecar for them is still a new
  file Lightroom ignores (unchanged, said on the page).

## Rerun

    node eval/cull-camera-ratings.mjs mei > ratings.tsv
    python3 -I eval/cull-rating-tag-scan.py mei
    python3 -m http.server 8765 -d site &
    node eval/cull-sidecar-roundtrip.mjs http://localhost:8765/cull.html mei WORK
