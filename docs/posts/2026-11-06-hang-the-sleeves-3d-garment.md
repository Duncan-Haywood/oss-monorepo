---
title: "Letting the sleeves hang: a 3D garment preview that looks like a shirt"
seo_title: "3D clothing preview in the browser: hanging sleeves on a flat garment mesh"
date: 2026-11-06
tags: [clothing-design-studio, webgl, 3d]
description: "How the free Clothing Design Studio turns a flat garment drawing into a 3D preview with sleeves that hang, without moving the artwork."
---

The studio's 3D preview builds a mesh from the flat drawing of the garment, so a print sits where the designer put it and turns with the shirt. Until now the sleeves stayed out in a T, which made every shirt look like a scarecrow.

The fix is small. Points beyond the body columns swing down and in about the shoulder, with the angle fading in over a 55-unit band so the armpit seam never tears. Only positions and normals move; texture coordinates keep the original drawing, so artwork does not slide. Tests check that the torso never moves, that left and right mirror, and that one point lands where a hand calculation says.

It is still a rounded solid: no drape, seams or fit. Hanging arms, though, make the preview readable at a glance when you are checking a painting on a shirt.
