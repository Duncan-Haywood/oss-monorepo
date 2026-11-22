---
title: "The dark edge of the sensor: checking a noise estimate against the masked sensels"
seo_title: "Checking a raw noise estimate against masked sensels"
date: 2026-11-22
tags: [photo-editing, raw, noise, evaluation]
description: "On 8 public raws whose masked sensels survive, the frame's own read-noise term came out 0 on 4. Only 8 of 57 files keep a usable masked edge."
---

ShootFlow's raw developer blends two demosaics, block by block, according to
how much noise the frame holds. When a file carries no noise profile, the
developer reads one from the picture. It fits a line through brightness bins,
variance = shot × level + read. The read term is the line's intercept: a value
at black, extrapolated from bins that may all sit well above black.

Most image sensors keep a strip of sensels covered from light at one or more
edges. Those masked sensels see no scene, so their spread is the read noise
itself. That makes them an independent check on the intercept, and a possible
floor for it. Before building that floor into the developer, we measured two
things on the public metadata-extractor sample raws: how often the masked strip
is usable, and how far the picture's own estimate falls short of it.

## Few files keep a usable dark edge

Read through LibRaw, only **8 of 57** files gave a usable masked reading:
four Canons, a Pentax K-1 Mark II, a Samsung NX3000, an LG Nexus 5X DNG and an
Olympus E-P3. On the Sony, Nikon and Panasonic files, LibRaw's picture area
starts at the sensor's corner. The trimmed columns it leaves at the right edge
are too narrow, constant padding, or not at the black level. Two more files
had "masked" strips quieter than half a count, which means zeroed or filled,
not read noise. That is a limit of this reading, not of the sensors: our own
Nikon reader finds masked right-edge columns on five of seven Nikon bodies.

Getting the number right took care. A median absolute deviation, the usual
robust spread, is quantised on whole-number sensels at 2 to 3 counts, so a
true sigma of 2.0 read as 1.48. We used a standard deviation after clipping
hot sensels. We also removed each line's mean first, so row banding does not
count as read noise.

## What the masked sensels say

| file | masked sigma (counts) | frame read / masked | deep-shadow sigma, floored / frame |
|---|---:|---:|---:|
| Canon EOS 600D | 6.85 | 0.00 | 1.16x |
| LG Nexus 5X | 1.75 | 0.00 | 1.54x |
| Pentax K-1 Mark II | 29.16 | 0.00 | 2.34x |
| Samsung NX3000 | 1.66 | 0.00 | 1.08x |
| Canon EOS 70D | 7.54 | 0.48 | 1.14x |
| Canon EOS 7D | 4.90 | 1.30 | 1.00x |
| Canon EOS 350D | 2.82 | 3.39 | 1.00x |
| Olympus PEN E-P3 | 2.86 | 5.91 | 1.00x |

On 4 of the 8 the fitted read term was negative and clamped to zero. On 5 it
was under half what the masked sensels show. A floor would raise the noise
sigma at 1% of white by 8% to 134% on those. On the other 3 the picture reads
*more* than the dark edge, which is expected: covered sensels cannot see fixed
pattern under light or scene texture left in the darkest bins. So a floor only
ever raises a read term, never lowers one.

The Pentax stands out: 29 counts of masked read noise on a 30-second ISO 1600
frame, with a fitted read term of zero. It is the same file that earlier
selection tests could not settle, because nobody could say whether its clean
reference was noisy. Its dark edge answers that without looking at the scene.

## Why it is not in the developer yet

The demosaic evaluations add synthetic noise to clean reference tiles. Those
tiles have no masked edge, so they cannot score a floor. An understated noise
model only moves the blend toward the sharper directional demosaic, which is a
safe failure. Changing the default for 8 of 57 bodies with no score would be a
guess.

The next steps are in the venture's NEXT.md:

- read the margins through ShootFlow's own readers, which should add the Nikon
  bodies;
- score the floor on a real low/high-ISO pair of one static scene;
- try masked sigma as the "is this reference clean?" judge.

Method, raw rows and tests: `ventures/photo-editing/eval/optical-black-floor-2026-11-22.md`,
`tools/optical_black_floor.py`, `tests/test_optical_black_floor.py`.
