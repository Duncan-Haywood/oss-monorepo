---
title: "Making a 3D shed look like the house next to it, without slowing the phone"
date: 2026-10-30
tags: [shed-designer, webgl, design]
description: "House paint colours, shingle families, lap and T1-11 textures, a lawn and sky. Splitting the shader per material made the 3D view faster, not slower."
---

A homeowner and a builder walked through the [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) for a real shed. They wanted asphalt shingles to match the house, and horizontal lap siding painted to match their fiber cement house. They also needed a picture good enough for the HOA. The 3D view was a CAD model of red-brown T1-11 boxes floating on pale grey, with every board outlined, and its colour list ran to hot pink and lavender but had no sage or navy.

**What changed**

- **Paint colours a house actually wears.** There are 20 generic names for siding, trim and door: white, cream, light gray, greige, charcoal gray, slate blue, navy, sage, forest green, khaki, dark brown, black and the original ones. A colour picker beside each list takes any colour. You can pick it from a photo of the house, and the shopping list and paint step then name it as "custom colour #5a6e8c". The names are deliberately generic, not a paint maker's. A screen colour is not a paint chip, so take a sample to the store.
- **The door has its own colour.** It can follow the siding or the trim.
- **Shingle colour families.** There are eight, from black to a red blend. Each has its own amount of tab-to-tab variation, because architectural shingles are blends of granules. They are drawn as 5" courses with tabs of uneven width that are staggered from course to course.
- **Siding textures.** Lap siding gets a shadow line under each course. T1-11 gets its grooves every 8", and board and batten keeps its battens.
- **A lawn, a sky and a soft shadow.** The shadow is cast away from the light, and the walls darken a little toward the ground. All of it is computed in the shader, with no shadow-map pass.
- **Presentation.** One button hides the board outlines and the dimension lines and turns to a lower three-quarter view with sky behind the roof. It gives the picture you would show a neighbour.

**The speed surprise**

We measured with the page's own orbit keys in headless Chromium on SwiftShader, the software renderer a phone or locked-down laptop falls back to when it has no usable GPU. We took the mean time per orbit step, 60 steps each, on the default 8x12:

| | before | first try | shipped |
|---|---|---|---|
| default view, laptop size | 54 ms | 80 ms | 45 ms |
| default view, phone size | 54 ms | 84 ms | 48 ms |
| presentation, phone size | (none) | 66 ms | 34 ms |

The first try was one shader with every finish in it, and it was 50% slower. Taking out the shingle maths alone saved about 13 ms, even though shingles cover a fraction of the screen. A software renderer runs both sides of every branch for every pixel, so each board paid for the roof.

The shipped version compiles four variants of the same shader (plain, siding, roof, lawn), and each layer is drawn with only the code it needs. That made it faster than the old single shader. The lawn is also drawn after the shed, so the pixels the shed hides fail the depth test before they are shaded. The sky pass is skipped when the camera looks down far enough that no sky is in frame. A real GPU would never have noticed any of this, but a phone on the software path does.

The tool is still not engineered or code-checked, and a picture is not an HOA approval. It is a clearer thing to bring to one.
