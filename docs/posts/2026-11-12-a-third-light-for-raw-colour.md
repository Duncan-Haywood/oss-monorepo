---
title: "Tungsten, daylight and the tube light in between: reading DNG 1.6's third colour matrix"
seo_title: "DNG 1.6 triple-illuminant profiles (ColorMatrix3), implemented"
date: 2026-11-12
tags: [photo-editing, shootflow, dng, colour]
description: "DNG 1.6 profiles can carry a third camera matrix for fluorescent or LED light. ShootFlow now blends all three; test-scene error falls from 0.079 to 0.0005."
---

A camera doesn't see colour the same way under every light. So a raw DNG file carries two
colour matrices, one measured under tungsten and one under daylight, and the raw converter
blends them by the photo's colour temperature. That works for any light between those two.
A fluorescent tube or a white LED isn't between them: its white sits off the tungsten-daylight
line, on the green side, and no blend of the two matrices matches how the sensor responds
to it.

DNG 1.6 added a fix: a third set of tags (`ColorMatrix3`, `CalibrationIlluminant3` and
companions) for a third light, plus `IlluminantData` to describe a custom light by its
chromaticity or its full spectrum. The specification doesn't say how to blend three sets.
Adobe's DNG SDK does it like this. Each white is placed on a plane whose axes are tint and
inverse temperature, and each light is weighted by inverse squared distance from the
photo's white. The weights are then smoothed, and any under 2% are dropped.

ShootFlow's raw developer now does the same. On a synthetic scene of colour patches lit by
CIE F2 (cool white fluorescent), with a camera whose response under F2 is its own matrix, the
three-light profile gives the patches back within 0.0005 in linear light. Reading the same
file as a two-light profile misses by 0.079, about 20 steps in 8-bit sRGB.

The temperature and tint maths matches colour-science on 5,000 random whites. The spectrum
path gives colour-science's chromaticities for 20 CIE illuminants within 0.00005. The weights
are checked by their properties: each light gets full weight at its own white, the weights
always sum to one, and they change smoothly as the white moves. They have not yet been
compared value for value with the SDK's own output. Two inputs are still missing: a real
DNG 1.6 three-light profile, and those reference values.

Code and numbers: `ventures/photo-editing/eval/triple-illuminant-2026-11-12.md`.
