---
title: "Caption a shoot before Lightroom: the free browser culler now writes IPTC captions, keywords and copyright"
seo_title: "Add IPTC captions and keywords to raw files, free in the browser"
date: 2026-11-24
tags: [photo-editing, raw, culling, iptc, metadata]
description: "ShootFlow Cull now fills IPTC captions, keywords and copyright from a template with variables and writes them into XMP sidecars. Read back by ExifTool."
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html) is a free
browser page for picking frames from a card of raw files. It rates, labels and
rejects from the keyboard, marks the sharpest frame of each burst at the
camera's AF point, and writes XMP sidecars that Lightroom, Capture One or
darktable read on import. Nothing is uploaded.

Picking is half of a photo desk's job. The other half is captioning: who shot
it, the copyright line, where it was, and keywords an archive can search.
Agencies reject frames without them. Photo Mechanic, the paid tool most
working photographers use for this, does it with a "stationery pad": a
template whose variables, such as the capture date, are filled in for each
frame.

## What landed

Under the download button there is now a "Captions, keywords and copyright
(IPTC)" box: creator, copyright notice, credit, source, headline, title,
caption, keywords, sublocation, city, state, country and instructions. Any box
can use variables: `{date}`, `{year}`, `{monthname}`, `{day}`, `{time}`,
`{camera}`, `{lens}`, `{file}`, `{stem}`, `{seq}`, `{iso}`, `{aperture}`,
`{shutter}` and `{focal}`. So "© {year} Jane Doe" becomes the year each frame
was taken, and "Shot on {camera} at {aperture}" reads "Shot on NIKON D810 at
f/3.5". A variable name with a typo stays in the text as you typed it, so you
see the mistake instead of losing it. Press `K` on a frame to add keywords to
that frame only.

The fields go into the same sidecars as the ratings, written as the IPTC
standard's XMP properties (`dc:description`, `dc:subject`, `dc:rights`,
`dc:creator`, `photoshop:City` and the rest). If you dropped your own
sidecars with the raws, the page edits those: empty boxes leave the caption
that is already there alone, new keywords join the existing ones without
duplicates, a title's other languages stay, and Lightroom's develop
settings are left as they were. The template stays in your browser between
visits. You can also save it as a file, or load one from a sidecar you have
already captioned.

## How it was checked

Three Nikon raws from a public sample set went through the page in headless
Chromium, one of them with a Lightroom-style sidecar holding develop settings,
a keyword and an English and French title. ExifTool, an independent reader,
then read the downloaded sidecars. Every field came back as typed, with the
variables filled in. The old keyword sat beside the new ones, the French title
was still there, and the exposure and crop settings were unchanged.
`exiftool -validate` reported OK on every file. All 13 fields also came back
from a fresh sidecar, quotes and ampersands included. The run is in
`ventures/photo-editing/eval/cull-iptc-2026-11-24.md`.

What has not been checked: an import into Lightroom, Capture One or Photo
Mechanic itself. ExifTool is the only reader tested so far. Hierarchical
keywords (Lightroom's "Sport|Ice hockey") and Photo Mechanic's code
replacements (a short code that expands to a player's name) are not written
yet. They are next.
