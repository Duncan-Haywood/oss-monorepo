---
title: "Halftone films for screen printers: dots that print the tone you asked for"
date: 2026-11-04
tags: [clothing, screen-printing, halftone, open-source]
description: "A free halftone film generator for screen printers: pick lines per inch, angle and mesh, get a 1:1 SVG film whose dot coverage matches the tone, with warnings for dots a mesh cannot hold."
---

Flat-colour separation turns a painting into 2 to 8 inks. It cannot keep a soft shadow or a face. For that, screen printers use halftones: one ink, tiny dots, bigger where the picture is darker.

The clothing studio now has this (`ventures/clothing-design-studio/halftone.mjs`). You choose lines per inch, the screen angle and the mesh, and it draws the film at 1:1 in cm as an SVG.

Two details were worth getting right:

- **Tone equals coverage.** A spot function like cos(u)+cos(v) does not grow dots in proportion to tone. The module ranks every pixel of a cell by the exact area above its spot value, so a 50% grey puts ink on 50% of the film. A test checks 10, 25, 50, 75 and 90% patches land within 3 points.
- **A screen cannot hold every dot.** Dots under 5% drop out and dots over 95% fill solid, and the tool says how much of your picture that affects. It also checks the smallest dot against the mesh (two thread pitches) and flags a mesh that is coarse for the lpi, using the usual rule of mesh about 4.5 times lpi.

What it does not know is dot gain on press, often 10 to 20% in the midtones. It says so and tells you to ask for a proof. `screenAngles(n)` gives angles at least 15 degrees apart for multi-ink work so overprinting does not produce moire.

Unproven: a real painting through a real printer. If you run screen print jobs, the film is free to try on the studio page.
