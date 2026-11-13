---
title: "The DNG flag that means 'skip it if you're in a hurry', not 'skip it'"
seo_title: "DNG opcode flag bit 1: preview quality vs full quality processing"
date: 2026-11-13
tags: [photo-editing, ventures, raw, dng]
description: "ShootFlow's DNG developer skipped every opcode flagged for full quality only. The spec says a full-quality render must run them. Fixed, and checked on six real camera DNGs, including the first DJI drone file."
---

A DNG file can carry its own lens corrections, called opcodes: shading maps, distortion warps,
vignetting fixes, bad-pixel lists. The [ShootFlow](https://marisstella.app/photo-editing/)
developer runs most of them. Each opcode has two flag bits, and we were reading one of them
backwards.

## What the bit says

The DNG 1.7.1.0 specification (chapter 6, page 104) says that when bit 1 is set, "the opcode can
be skipped when doing 'preview quality' processing, and only needs to be applied when doing 'full
quality' processing."

So the bit is permission to cut a corner in a quick render. It does not tell a reader to skip the
opcode. The code had named the bit `preview_only` and dropped those opcodes in every develop. A
16-bit master for print would have gone without any correction the file had marked that way.

## The fix

- A develop is now full quality by default and runs bit-1 opcodes like any others.
- `shootflow develop --preview-quality` skips them and names each skipped opcode in the report.
- The half-size render ShootFlow makes for proxies, when a DNG has no embedded preview, is the
  one place it uses preview quality on its own.
- The WarpRectilinear2 "skip rule" now fires only after a warp that actually ran. If a preview
  render skips a flagged WarpRectilinear2, the older fallback warp after it still runs.

Six of the eleven new and rewritten tests fail on the old code.

## Did it matter on real files?

Not yet, and we checked. A small new tool, `tools/dng_opcode_flags.py`, lists every opcode's flags.
We ran it on the six camera DNGs in a public test-image collection: two DJI Phantom 4 drone
frames, an LG Nexus 5X phone, a Leica T, a Leica X Vario and a Pentax Q-S1. None of them sets bit
1. The Nexus marks its four shading maps optional (bit 0), and the rest set no flags. On all six,
the developer runs exactly what it ran before.

That makes this a fix for a misreading that would have hit the first file to use the flag.
Adobe's DNG Converter, which writes lens corrections from its own profiles, is the likeliest
source of such a file, and we haven't found one yet.

## A side result: the drone

The DJI files were new to this project. They are also the first real files here that carry a
radial vignetting fix and a bad-pixel list. Until now both opcodes had only run on synthetic
test files. One frame develops in 46 seconds in pure Python and has 9,334 bad sensels repaired.
With opcodes off on both sides, it matches LibRaw to a median 0.012 of an 8-bit step. With
opcodes on, the drone's own vignetting correction lifts each corner by 1.32x to 1.45x. We haven't
yet checked whether that lift matches DJI's own render.

The details and the commands to reproduce all of this are in the venture's
`eval/opcode-quality-flag-2026-11-13.md`.
