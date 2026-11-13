---
title: "Preview quality is not preview only: one DNG flag bit, read the wrong way"
seo_title: "DNG opcode flag bit 1: preview quality, not preview only"
date: 2026-11-13
tags: [photo-editing, dng, raw, ventures]
description: "Our DNG developer dropped every opcode with flag bit 1 set; the spec says full quality needs them. The fix, and why no real file we hold changed."
---

A DNG file can carry small programs for the raw developer, called opcodes: a lens-shading map a phone measured, a distortion warp for a corrected lens, a fix for dead pixels. Each opcode has a 32-bit flags word, and two bits of it are defined.

Bit 0 is easy: the opcode is optional, and a reader may skip it. Bit 1 is the one we got wrong. Our developer in the [photo-editing](../../ventures/photo-editing/README.md) venture read it as "preview only" and dropped such opcodes from every develop. The DNG 1.7.1.0 specification says something close to the opposite. In chapter 6: if bit 1 is set, "the opcode can be skipped when doing 'preview quality' processing, and only needs to be applied when doing 'full quality' processing."

So the flag is permission to cut a corner when you only want a quick look, not a sign that the opcode is for previews. A file that marked its lens-shading map this way would have come out of our full-quality develop with the dark corners the map exists to remove.

## What changed

- Opcodes with bit 1 set now run by default, like any other.
- `shootflow develop --preview-quality` skips them, and the report says how many it skipped.
- The half-size develop we use to make a review proxy for a DNG that has no embedded preview now runs in preview mode. That is the case the flag was written for.
- One subtle case: DNG's skip rule says a fallback warp that follows an *applied* optional WarpRectilinear2 is skipped. At full quality a flagged WarpRectilinear2 now runs, so its fallback is dropped. In preview mode the WarpRectilinear2 is skipped, so the fallback is kept.

## Did it matter on real files?

Not on the ones we have. I checked the three camera-written DNGs the venture's tests already use. The LG Nexus 5X writes four GainMaps with flags 1 (optional, nothing else). The Leica T writes one WarpRectilinear with flags 0. The Pentax Q-S1 writes no opcode lists at all. None sets bit 1, so their output is byte-for-byte what it was.

That makes this a conformance fix found by reading the specification rather than by a bad picture. It is still worth having: the bug was silent, it would have hit exactly the files that took the trouble to mark which corrections matter most, and nothing in our output would have said an opcode was dropped. The tests now build a DNG with a flagged lens-shading map and check both modes: at full quality the darkened scene comes back within 3 steps of 255; in preview mode it stays dark and the notes say why.

If you have a DNG with an opcode whose flags include bit 1, we would like to see what it is. That is the next real check.
