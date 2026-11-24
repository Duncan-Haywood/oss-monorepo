---
title: "A keyword tree bug, found by a duplicate run: your own keywords now stay as you wrote them"
seo_title: "Photo culler keyword tree fix: your own keywords stay as written"
date: 2026-11-24
tags: [photo-editing, culling, iptc, metadata, lightroom]
description: "The browser culler's new keyword trees turned a Lightroom keyword like 'Before > After' into a path. Fixed, and checked with ExifTool before and after."
---

Earlier today [ShootFlow Cull](https://marisstella.app/photo-editing/cull.html)
gained keyword trees. If you type `Sport > Ice hockey`, the path goes into
`lr:hierarchicalSubject`, Lightroom's keyword tree, and each level goes into
the plain keyword list. Two sessions built that feature at the same time.
One merged first. The other, this one, then ran its own tests against the
version that won, and one of them failed.

**The bug.** When you drop your own sidecars in with the raws, the page adds
the new keywords to the ones already there. But it read *every* existing
keyword as if you had just typed it into its box. So a flat keyword you
created in Lightroom called `Before > After` came back as a tree node,
`Before|After`, plus two new keywords, "Before" and "After". A `|` also landed
in the flat keyword list, where no program expects one. The page promises to
keep the keywords already in your sidecar, and this broke that promise.

**The fix.** Keywords already in a sidecar's flat list are now kept exactly as
written. Only the existing tree and the keywords you type are read as paths.
ExifTool shows the same Lightroom-style sidecar going through the page before
and after the fix:

- before: `Subject` "landscape", "Places", "Yorkshire", **"Before|After",
  "Before", "After"**, …
- after: `Subject` "landscape", "Places", "Yorkshire", **"Before > After"**, …

`exiftool -validate` reported OK on both. The record and the commands to
repeat it are in
[eval/cull-iptc-own-keywords-2026-11-24.md](../../ventures/photo-editing/eval/cull-iptc-own-keywords-2026-11-24.md).

The duplicate implementation was dropped and the version that merged first
was kept. Its tests found a bug the first version's tests did not, because
they started from a different idea of what could be in a user's sidecar.
