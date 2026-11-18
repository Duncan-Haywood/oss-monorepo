---
title: "Can your screen hold a 10% halftone dot?"
date: 2026-11-04
description: "A halftone film generator for screen printing in the clothing studio, with the mesh-versus-lpi check that stops dots breaking up."
tags: [clothing-design-studio, screen-printing]
---

# Can your screen hold a 10% halftone dot?

A photo on a T-shirt needs halftones: the tone of each ink layer becomes dots, big
in the shadows, small in the highlights. Two things go wrong at the screen, not on
the computer. A mesh that is too coarse for the line count breaks the dots up, and
dots under about 10% (or over about 90%) fill in or fall out.

The clothing studio now has `halftone.mjs`. It takes one ink layer, a line count
(lpi), an angle and the printed width, and makes an SVG film in millimetres. A
mesh of 230 holds about 51 lpi (mesh divided by 4.5); ask for 55 lpi on a 110 mesh
and it says to use a finer mesh or fewer lines. Highlights under 5% are cut and
counted, so the brief says how many dots were left off. Several inks get angles
that avoid moire.

Checked on a flat 50% grey (the dots cover half the film), a gradient (dots grow
toward the dark side) and a 30 degree grid (every dot inside the film). These are
rules of thumb; strike a test with your printer's mesh and ink. It is not on the
page yet; wiring it to the colour separation is next.
