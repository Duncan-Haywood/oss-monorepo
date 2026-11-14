---
title: "Panasonic raw files, read from the top down"
seo_title: "Reading Panasonic RW2 raw files directly, checked against LibRaw"
date: 2026-11-14
tags: [photography, raw, panasonic, lumix, rw2, open-source, photo-editing]
description: "ShootFlow now develops Panasonic Lumix RW2 files itself. On four real bodies, GF1 to GF7, all 50 million stored sensels match LibRaw."
---

ShootFlow, the open-source photo workflow in this repository, develops raw files into 16-bit masters. As of this afternoon it read DNG, Canon CR2, Sony ARW, Nikon NEF and Olympus ORF. Lumix shooters still had to run every file through Adobe's DNG Converter first. Now `shootflow develop P1000001.RW2 --dcp FOLDER` reads the RW2 itself, and so does the overnight pipeline's grade stage.

## A block format read backwards

Panasonic's compressed RW2 doesn't use one long bit stream. The sensor data comes in 16 KB blocks, and each block is stored rotated: its last 8,184 bytes come first. Inside a block, bits are taken from the top down. A position counter starts at the block's last bit and counts down, and a small XOR picks which byte holds it.

On that layout sits a simple code. Each row is cut into runs of 14 values. At the start of a run, the prediction for each of the two alternating Bayer colours resets. The first value of each colour is written whole. Each later one is an 8-bit step from the one before. Every third value reads a 2-bit code that sets how far the steps are shifted: by 0, 1, 2 or 4 bits. Small shifts keep fine detail in smooth areas. A shift of 4 lets a step jump across an edge, at the cost of the bottom four bits.

The format is not documented by Panasonic. dcraw and LibRaw have read it for years, and this reader follows the behaviour they describe. The code is new, and LibRaw is the check.

## The check

The test files are the four camera RW2s in a public sample collection on GitHub: the GF1 (2009), GF3 (2011), LX7 (2012) and GF7 (2015). Each was read by ShootFlow and by LibRaw 0.22 through rawpy. All 50,087,520 stored sensels were equal. That held for ShootFlow's C decoder (0.07 to 0.15 seconds a file) and for its pure-Python reference (7 to 11 seconds). The white balance, the black level at each filter position, the filter pattern and the crop were equal on all four.

The unit tests use an encoder written for them. It takes a grid of values and picks the smallest shift that codes each group of three. It then writes every code where the decoder will look for it, and fails if two codes would land on the same bit. A test field four blocks long, using all four shifts, comes back exactly from both decoders.

## What the files showed

- **The extra columns are not a black reference.** Every body stores 40 to 216 columns past the picture's right edge. You might expect them to be masked sensor at black level. They are not: their medians run from 201 to 1,140 against a black of 143, and some values pass 5,000, beyond the 12-bit range. The sensor-border tags leave them out, and so does ShootFlow.
- **The GF1 clips below 4095.** Its brightest value inside the picture is 3,975. The file's own tags claim 16,383, so ShootFlow uses the 12-bit ceiling, and a blown GF1 highlight renders a light grey about 0.04 stops under white. LibRaw keeps a per-camera table for this (3,986). ShootFlow doesn't yet.
- **The lens isn't where the other formats keep it.** The EXIF block an RW2 points to has the focal length but no lens name and no maker note. Panasonic keeps those in the camera JPEG embedded in the file. Until ShootFlow reads them there, its lens-correction stage can't name a Lumix lens, and it says so in the master's notes.

## What's left

Newer Lumix bodies (the GH5 era on) use a different block layout, RawFormat 5 and later. With no test file at hand, ShootFlow refuses those and suggests the DNG Converter rather than guessing. Colour is still only as good as the `.dcp` profile you give it. The full measurements are in `ventures/photo-editing/eval/panasonic-rw2-reader-2026-11-14.md`.
