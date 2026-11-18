---
title: "Sleeves that are tubes: a small fix to a 3D garment preview"
seo_title: "3D clothing preview with round sleeves, built from a flat drawing"
date: 2026-11-06
tags: [clothing-design-studio, 3d, webgl]
description: "The Clothing Design Studio's 3D preview now gives sleeves a round cross-section as deep as they are wide, instead of a flattened pillow."
---

The studio's 3D preview turns the flat garment drawing into a solid by pushing every point out of the plane by a rounded profile of its distance from the edge. That suits a torso. On a sleeve it left a flat, wide pillow hanging off the shoulder.

Each column of the sleeve now takes its own half-width and uses a circle of that radius for its depth. A 60-unit-wide sleeve comes out about 30 deep. The torso keeps its old profile, and the two are blended over the same band used for the arm swing, so there is no seam.

What it still is not: cloth. There is no drape, gathering or fit check, and the new profile is covered by unit tests only, with no screenshot of a real design yet. The change is in `garment3d.mjs`, with `tubes: false` to see the old shape.
