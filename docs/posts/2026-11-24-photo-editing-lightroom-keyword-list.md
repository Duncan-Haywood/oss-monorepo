---
title: "Bring your Lightroom keyword list to a free browser culler"
date: 2026-11-24
tags: [photo-editing, keywords, lightroom, culling, metadata]
description: "ShootFlow Cull now loads the keyword list Lightroom exports, so a typed name or synonym lands in the right place in your keyword tree."
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html) is a free
page for picking frames from a card of raw files and writing XMP sidecars for
Lightroom, Capture One or darktable. Nothing is uploaded. It already wrote
keyword trees, as long as you typed the whole path: `Sport|Ice hockey`.
Nobody types that forty times on deadline.

## What changed

Most photographers who keyword seriously already have a controlled
vocabulary, built up in Lightroom over years. Lightroom Classic exports it
with **Metadata › Export Keywords** as a plain text file: one keyword per
line, a tab for each level, `[brackets]` round a keyword that should not be
exported (a category like "People"), `{braces}` round a synonym. Photo
Mechanic's Structured Keywords use the same layout.

Load that file in the cull page and three things happen:

- **A plain name finds its place.** Typing `Ice hockey`, or its synonym
  `hockey`, writes `Sport|Ice hockey` into Lightroom's tree field and `Sport`,
  `Ice hockey` and `hockey` into the flat keywords. Bracketed levels stay out
  of the flat list, like Lightroom keeps them.
- **It doesn't guess.** If "Final" sits under both Ice hockey and Football,
  or "Gretzky" isn't in your list, the keyword is written as typed and the
  page tells you which ones before you download. Typing `Football > Final`
  picks the one you mean.
- **New keywords go back.** A button writes every keyword the shoot used as
  a keyword list in the same layout, for **Metadata › Import Keywords**.

## How it was checked

Five unit tests, one of which loads a list and writes it back out to the
identical bytes. Then the page ran in headless Chromium on two public Nikon
raw files with a ten-keyword list. ExifTool 12.76 read the sidecars back:
`Sport|Ice hockey`, `People|Jane Roe` and `Places|Yorkshire|Leeds` in the
tree, the synonyms in the flat keywords, no "People" there, and both files
passed `-validate`. The full output is in the
[write-up](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/cull-keyword-list-2026-11-24.md).

What we have not done is run Lightroom on the result: the rules for synonyms
and bracketed keywords match Lightroom's defaults as documented, but the
import itself is unchecked. That is the next thing to find out.
