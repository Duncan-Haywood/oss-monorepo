---
title: "Twelve Coolpix raw files read as noise, and nothing complained"
date: 2026-11-18
tags: [photo-editing, raw, nikon, coolpix, libraw]
description: "ShootFlow's NEF reader took Nikon Coolpix NRW files without an error and decoded them into noise. Five storage layouts later, 13 of 13 match LibRaw."
---

[ShootFlow](https://marisstella.app/photo-editing/) develops camera raw files
into 16-bit TIFF masters without going through Adobe's DNG Converter. Its
Nikon reader was checked on 18 NEFs from 16 bodies, every sensor value equal
to LibRaw's. The to-do list said a Coolpix `.NRW` reader was waiting for a
public sample file.

There were samples all along. [raw.pixls.us](https://raw.pixls.us/) (CC0) has
NRW files from twelve Coolpix bodies. Running them through the same LibRaw
comparison before changing anything:

| body | sensor values wrong |
|---|---|
| P6000 | 12.8 M of 13.5 M |
| P7000 | 9.9 M of 10.0 M |
| P1000 | 15.8 M of 16.0 M |
| P330, P340, P7700, P7800 | all but a few hundred of 12.2 M |
| B700 | 20.1 M |
| E8800 (an older Coolpix `.NEF`) | 8.0 M |

Nothing raised an error. A Coolpix raw is a Nikon TIFF with a colour-filter
image in a SubIFD, which is everything the NEF reader checks for, so it read
these files as if a D-series body had written them. The README even said
Coolpix files were "refused". They weren't. Since the card copy started
keeping `.NRW` files two days ago, a Coolpix shooter would have got a
confident develop of static.

## Five layouts and no tag that names them

The compacts store their sensor data in ways the D-series bodies don't:

- **12-bit values packed MSB first**, as in an uncompressed D200 file (P340,
  E8800). The P340's raw IFD says compression 34713, Nikon's Huffman
  coding, but the data isn't Huffman-coded at all.
- **The same packing inside little-endian 32-bit words** (P6000, P7000,
  P7100, P950, P1000, B700). Each four bytes have to be reversed before
  unpacking.
- **One 16-bit word per sensel**, little-endian (A1000) or big-endian with
  the 12-bit value in the top bits (P330, P7700, P7800).
- **Even rows first, then odd rows** (E8800).

dcraw and LibRaw pick the layout from per-model tables. ShootFlow uses the
data instead. The strips' byte count tells packed from 16-bit. For the byte
order, the reader decodes a band of eight rows from the middle of the frame
both ways. Done right, sensels of the same colour two columns apart differ
by a little, because it's a picture. Done wrong, they differ by a lot,
because it's noise. The other order has to be at least twice as smooth to
win, so ordinary NEFs keep their usual order. That held on all seven
D-series files from the original check, including the uncompressed D200.

## The smaller faults

- **Black level.** Seven bodies came out at 0. Three of them (P950, P1000,
  B700) store the level in a maker-note block that starts with the text
  `NRW 0104`. The four 4032-pixel-wide bodies store no level at all and use
  LibRaw's per-model 200. In those four files
  no sensel reads below 200 (the lowest are 201 to 217).
- **White balance.** Four bodies have no as-shot white-balance tag (0x000C).
  The same maker-note block carries the balance, with red and blue stored at
  half value.
- **The P6000's colour-filter tag is wrong.** It says GBRG. In the sensels,
  the sites at (0,1) and (1,0) average 709.9 and 710.0 with a correlation of
  0.996, while the other diagonal's two sites average 507 and 500. Green is
  on the first diagonal, so the layout is RGGB, which is also how LibRaw reads
  it. Where the tag and the sensels disagree, the sensels win.

## Where it ended

All 13 Coolpix files (twelve NRW and E-series bodies plus the Coolpix A,
which was already right) now match LibRaw 0.22 in every sensor value, black
level, white balance and colour-filter pattern, on both the C and Python
decoders. One honest footnote: LibRaw shifts the P330's 16-bit words down
four bits but keeps the P7700's and P7800's at full size, though all three
store the same thing. ShootFlow keeps all three at full size, so the P330 is
compared at LibRaw's scale. The measurements are in
[`eval/nikon-nrw-reader-2026-11-18.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/nikon-nrw-reader-2026-11-18.md).

What's still missing is colour. Like every NEF, an NRW needs the camera's
`.dcp` profile, which Adobe's free DNG Converter installs. That profile is
the one step left before a Coolpix frame develops correctly.

The lesson that carries over: "no public sample yet" was a note from an
earlier run, and nobody had checked it since. It took one directory listing
to disprove.
