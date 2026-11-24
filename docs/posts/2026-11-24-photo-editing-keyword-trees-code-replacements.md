---
title: "Keyword trees and code replacements in a free browser culler"
date: 2026-11-24
tags: [photo-editing, iptc, keywords, culling, metadata]
description: "ShootFlow Cull now writes Lightroom keyword hierarchies, expands Photo Mechanic-style codes like \\23\\ into names, and takes a caption per frame."
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html) is a free
page for picking frames from a card of raw files and writing XMP sidecars that
Lightroom, Capture One or darktable read on import. Earlier today it learned to
fill IPTC captions, keywords and copyright from a template. This post covers
the next three things a sports or event desk needs. Nothing is uploaded.

## Keyword trees

Archives sort keywords into trees: `Sport > Ice hockey > Final`, `Places >
Yorkshire`. Lightroom keeps the tree in its own XMP property,
`lr:hierarchicalSubject`, with levels joined by `|`. Most other readers only
see the flat list in `dc:subject`. So a keyword typed `Sport|Ice hockey` (or
`Sport > Ice hockey`) now goes in twice: every level goes into the flat list,
and the path goes into the tree. When a sidecar gets a tree, the tree also
lists the flat keywords that are not part of any path, so a reader that builds
keywords from the tree alone still gets all of them. Drop your own sidecar with
the raw and the page merges into the tree that is already there.

## Code replacements

Photo Mechanic's best-known desk feature is code replacement. You keep a
list, often a team roster, that maps short codes to full text, and typing
`\23\` writes out "Jane Roe (Northfield Owls, 23)". The cull page now reads
the same kind of list, one `code`, tab, `text` per line (or `code=text`),
typed in or loaded from a .txt. Codes work in every template box, in a frame's
own keywords and in its caption. `\23#2\` picks the second column, so one
line can hold both a caption form and a short keyword form of a name. An
unknown code stays as typed, so a typo shows up in the output rather than
disappearing.

## A caption per frame

Press `C` on a frame to give it its own caption. It replaces the template's,
or fills `{caption}` in it, so `{caption} Shot on {camera}, {monthname} {day},
{year}.` gives each frame its own first sentence and a shared second one.

## How it was checked

There are twelve unit tests on the module. For a page run in headless
Chromium we used three public Nikon raws and a Lightroom-style sidecar that
already held a `Places|Yorkshire` tree, then read the downloaded sidecars back
with ExifTool 12.76. One frame came out with the subject list `Sport, Ice
hockey, Northfield Owls, 2008, Roe, Final`, the tree `Sport|Ice hockey,
Sport|Ice hockey|Final, Northfield Owls, 2008, Roe` and the caption "Jane Roe
(Northfield Owls, 23) scores for Northfield Owls. Shot on NIKON D300, March 6,
2008." The other frame kept its existing tree, its flat keyword and its
Lightroom develop settings, and `exiftool -validate` reported OK for both
files. Names in the test are made up. The steps and output are in
[the eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/cull-iptc-tree-codes-2026-11-24.md).

What has not been checked: a real Lightroom Classic import, which would show
whether it builds the tree exactly as written. Photo Mechanic's own code
files can also use conventions beyond tab and `=`.
