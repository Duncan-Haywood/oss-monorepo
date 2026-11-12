---
title: "Two more instructions a raw file can carry: vignette and value maps"
seo_title: "DNG FixVignetteRadial and MapPolynomial opcodes, implemented"
date: 2026-11-12
tags: [photo-editing, ventures, raw, dng]
description: "ShootFlow's DNG developer now runs FixVignetteRadial and MapPolynomial, checked against the formulas. No real camera file carrying them has turned up yet."
---

[ShootFlow](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/photo-editing) develops raw photos into 16-bit masters on your own machine. A DNG file can carry instructions for its own correction: opcode lists, small programs the camera or converter writes for the developer to run. Today ShootFlow runs four of the fourteen. The two added this afternoon are `FixVignetteRadial` and `MapPolynomial`.

## What they do

`FixVignetteRadial` fixes the darkening towards the corners that most lenses show. It stores five numbers and an optical centre. The developer brightens each pixel by 1 + k0·r² + k1·r⁴ + k2·r⁶ + k3·r⁸ + k4·r¹⁰, where r is the distance from the centre and is 1 at the farthest corner. A phone writes a measured map instead (`GainMap`, which ShootFlow already ran). A camera with a well-behaved lens can get away with these five numbers.

`MapPolynomial` passes each value through a polynomial of degree up to 8. It can target an area, a range of colour planes and a row and column step. So it can, for example, touch only the red sensels of the Bayer pattern. It is a general-purpose tone or linearisation fix.

Both can sit in `OpcodeList2`, which runs on the sensor values before demosaic, or in `OpcodeList3`, which runs after it. ShootFlow now runs them from either list, in the order the file lists them, alongside the gain maps and the lens warp.

## One wrinkle: the developer's own white balance

By stage 3 the DNG specification expects plain camera values between 0 and 1. ShootFlow's developer holds them white-balanced at that point, because that is where it keeps them for the lens warp. That makes no difference to a vignette, since multiplying by a gain commutes with multiplying by a white-balance factor. Only the cap at white moves. It does matter for a polynomial: x² of a scaled value is not the scaled x². So each plane is divided by its white-balance scale, mapped, and multiplied back. The opcode sees the values the specification describes.

## How it is checked

No camera file carrying either opcode has been found. The public sample collection ShootFlow tests against can only be searched by guessing file names from inside the build container. Thirty-nine guesses (Leica, Ricoh, Pentax, DJI, recent phones) came back empty, and the list is written down so the next attempt doesn't repeat it. So the checks use files built for the test, against the formulas written out a second time, independently of the code:

- Darken a synthetic raw file by the inverse of a known vignette, give it the matching opcode, and develop it. It comes back within 3 8-bit steps of the undarkened file, which is the rounding of the darkened sensels. Without the opcode it is more than 20 steps off.
- Halve the red sensels and add a `MapPolynomial` of 2x on red only, at a step of 2. The scene comes back the same way.
- In stage 3, with white-balance scales of 2.1, 1.0 and 1.6, every output value matches the closed form to 12 decimal places.
- The pure-Python and numpy engines produce identical bytes with both new opcodes and the lens warp mixed across the two lists, at full and half size.

## What it doesn't prove

Adobe's SDK computes the vignette on a coarser fixed-point mask, so an Adobe render may differ from ours in the last bits. That has not been compared. A real file is the next check: DNG Converter output with lens corrections embedded, or a Leica or drone DNG, developed here and compared with the camera's own preview. That is how the [lens warp was checked](2026-11-12-the-leica-told-us-how-its-lens-bends.md) this morning. Details and the names tried: `ventures/photo-editing/eval/vignette-polynomial-2026-11-12.md`.
