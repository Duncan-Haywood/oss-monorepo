---
title: "Keyword trees and roster codes in a free browser culler"
seo_title: "Lightroom keyword hierarchy and roster codes in XMP, free"
date: 2026-11-24
tags: [photo-editing, culling, iptc, metadata, lightroom]
description: "ShootFlow Cull now writes Lightroom keyword trees (lr:hierarchicalSubject) and fills player names from a roster code list. ExifTool reads both back."
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html) is a free
browser page for picking frames from a card of raw files and writing XMP
sidecars. Earlier today it gained an
[IPTC template](2026-11-24-photo-editing-cull-iptc-captions.md) for captions,
keywords and copyright. That template wrote flat keywords only, and anyone
captioning a game had to type every player's name by hand. Both are fixed now.

**Keyword trees.** Type a keyword as a path, `Sport > Ice hockey` or
`Sport|Ice hockey`. The full path goes into `lr:hierarchicalSubject`, the list
Lightroom Classic, Bridge and digiKam keep keyword trees in. Each level also
goes into the plain `dc:subject` keywords, so software that has no trees still
finds "Ice hockey". If you dropped your own sidecars in with the raws, the new
paths are added to the tree already in them, and the entries already there
stay exactly as they were written.

**Roster codes.** Photo Mechanic users know code replacements: you keep a list
that maps short codes to text, and `\23\` in a caption becomes the name of
player 23. The cull page now does the same. Paste the list, or load it from a
text file with `code<TAB>name` (or `code=name`) on each line. Codes work in any
field and in the keywords you add to one frame with `K`, so
`People > Players > \7\` puts the right name in that frame's tree. A code
that isn't in the list is left as you typed it, so a typo shows up in the
sidecar instead of quietly disappearing.

## How it was checked

We loaded two Nikon NEFs from the public metadata-extractor sample set into
the page in headless Chromium, along with a Lightroom-style sidecar that
already held the tree `Events|Wedding`. We also loaded a three-line roster
file. ExifTool 12.76 then read the sidecars from the downloaded zip:

- D810: `HierarchicalSubject` ["Events|Wedding", "Sport|Rugby league",
  "People|Players|Jane Roe"]. The old entry was kept, and the Lightroom
  exposure setting in the same file was untouched.
- D300 headline: "Jane Roe scores for Leeds Rhinos", typed as
  `\23\ scores for \LDS\`.
- `exiftool -validate` reported OK on both files.

The full record and the commands to repeat it are in
[eval/cull-iptc-tree-2026-11-24.md](../../ventures/photo-editing/eval/cull-iptc-tree-2026-11-24.md).

## What we haven't checked

ExifTool is the only program that has read these files so far. The bag is the
same one Lightroom writes, but we haven't yet seen Lightroom's "Read Metadata
from Files" build a tree from it. Photo Mechanic's code files also have more
options than this page supports. It handles one text per code and the
backslash delimiter, not several columns per player.
