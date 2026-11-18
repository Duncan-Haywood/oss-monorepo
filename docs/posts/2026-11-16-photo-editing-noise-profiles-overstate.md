---
title: "Half of real DNG noise profiles overstate the noise: 43 of 83, up to 77x"
seo_title: "DNG NoiseProfile checked on 83 real files: half overstate noise"
date: 2026-11-16
description: "We checked 83 real DNGs' NoiseProfile tags against their own sensels. 43 state more noise than is there, up to 77x. The demosaic now guards against it."
tags: [photo-editing, raw, dng, demosaic, research]
---

Earlier today ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, got a noise-aware
demosaic. In flat regions, where edge-keeping only follows noise, it blends the edge-keeping result toward
plain averaging. Where there is real detail it keeps the edges. To tell the two apart it needs to know how
noisy the sensor is. It takes that from the DNG's own NoiseProfile tag, two numbers per colour plane that
phones and converters write. When it shipped, one real profile had been checked.

The same note said what would go wrong: a profile that overstates the noise by about 1.5x or more makes the
blend treat real detail as noise and smooth it away. So the next question was simple. How often are real
profiles right?

## 83 files, checked against themselves

raw.pixls.us, the public raw-sample archive, lists 262 DNGs. Reading just their headers over HTTP range
requests showed that 105 carry a NoiseProfile. We downloaded the 84 that hold a colour mosaic (one or two per
camera), ran each through the developer up to the point where the blend would see it, and compared the
profile with the noise in the frame's own sensels. One file would not read, which left 83 files from 80
cameras.

The comparison needs care, because a photo is not a test chart. Fine texture looks like noise to any
measurement that only has the photo. So the check splits the frame into 24 x 24 blocks, sorts them into
eight brightness bands, and in each band looks at the quietest 15% of blocks. Texture can only make those
blocks look noisier, never quieter. The band with the cleanest blocks then gives a reading that texture can
pull down but cannot push up. On synthetic scenes with known noise, half smooth and half fine detail, it reads
an honest profile as 0.95-1.02. A profile overstated k times reads as k, within 5%.

## What the files say

| who wrote the DNG | files | profile over measured noise |
|---|---|---|
| Adobe DNG Converter and Lightroom | 4 | 0.94-1.20 |
| Apple's own camera app | 1 | 0.74 |
| Samsung Galaxy S6 to S10 | 11 | 0.71-1.19 |
| Google phones, and HDR+ on a Xiaomi | 10 | 0.84-2.16 |
| Huawei and Honor | 18 | 0.86-7.10 (17 over 1.25) |
| iPhone third-party apps (VSCO, ProCamera 10.2, Camera+ 9) | 3 | 14, 30, 32 |
| Other phones, cameras, drones, 360 cameras | 36 | 0.45-77 |

Where you would expect a profile to be honest, the reading agrees: Adobe's profiles sit at 0.94-1.20. Then the
spread opens up. **43 of the 83 profiles state more than 1.25x the noise that is actually in the file, 25 more
than 2x, and 11 more than 5x.** The worst is a bq Aquaris phone at 77x. Three third-party iPhone camera apps
write 14-32x. A reading above 1 can mean two things: the profile is wrong, or the camera denoised the raw data
before saving it and the profile describes the sensor from before that. The DNG spec allows the second case.
For the demosaic it makes no difference: it has to respond to the noise that is in the data.

## What it would have cost, and the fix

On the synthetic scene, a profile 4x too high costs 1.4-4.2 dB of colour accuracy, and one 16x too high costs
6-11 dB. That is far worse than not using the profile at all. So the developer now checks every profile
before using it. A profile that reads over 1.25x the measured noise is scaled down to 1.25x, keeping its
shape, and the develop notes say so. On the synthetic scene the guarded blend comes within 0.02 dB of what
the true profile gives, for profiles anywhere from 2x to 100x too high, on both ordinary Bayer sensors and
Fujifilm's X-Trans. It adds about 2.7 seconds per file.

## A bug the check found

Fourteen of the files, from Samsung, OnePlus, Xiaomi, LG and asus, write a read-noise term of exactly zero.
The reader refused those as malformed, so the noise-aware mode quietly fell back to the default on every
Samsung phone in the set. The DNG 1.7.1.0 specification says the scale term must be positive and the offset
term non-negative, so zero is legal. The reader had the test the wrong way round. It now follows the text.

## What is still open

The noise-aware demosaic stays opt-in. The guard deals with bad profiles, but the blend's own gain (+0.3-0.4 dB
on average) is still measured on synthetic noise. Two pieces of evidence are missing: a real low- and high-ISO
pair of one static scene, and a luma score. The guard also has a known blind spot. A frame with no smooth
region anywhere has no clean band, so an overstated profile can get through.

The full tables, the per-file rows and the commands are in
`ventures/photo-editing/eval/noise-profile-real-dngs-2026-11-16.md`.
