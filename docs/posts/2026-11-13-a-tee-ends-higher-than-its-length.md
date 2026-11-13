---
title: "A t-shirt ends higher than its length: sewing the pattern onto a body in the browser"
seo_title: "Free virtual garment drape: cloth simulation of a t-shirt pattern on your measurements"
date: 2026-11-13
tags: [clothing-design-studio, simulation, fit]
description: "The studio now sews its drafted tee and hoodie panels around a body and lets them hang, after checking the solver against a hanging strip and a catenary."
---

A size chart says a medium tee is 71 cm long from the shoulder. Measure
71 cm straight down from your shoulder and you get one hem height. On the
studio's new drape page the hem comes out about 6.5 cm higher than that, on
every drafted tee, sweatshirt and hoodie that isn't stretched. The cloth uses
that length going over the shoulder and round the chest and back. A flat
chart can't show this, because the chart never puts the garment on a body.

`drape.html` in the Clothing Design Studio does put it on one. It takes the
front and back pattern pieces the studio already drafts, meshes them into
triangles, sews the shoulder and side seams around a body built from your
chest, waist, hip and height, and lets gravity settle the result. Then it
colours the cloth by how much it stretches around the body and gives figures
for chest, waist, hip and hem: stretch, gap to the body, how much of the cloth
touches, and pressure. It runs in about a second, in the browser, and your
measurements stay there.

## The solver passed three exact tests before any garment

The cloth is a grid of springs solved with extended position-based dynamics
(XPBD), and each spring is set from the fabric's tensile stiffness in newtons
per metre. I checked it against three cases with exact answers before using
it on a garment:

- **A strip hanging under its own weight** should stretch by ρgL²/2K. The
  first version stretched 11% too little on one mesh and 23% too little on a
  coarser one. An error that changes with mesh size points to a modelling
  mistake, not a tolerance. The springs along the panel's outline were each
  carrying a full grid cell when they border only half of one. With that
  fixed, the strip is within 2% on both meshes.
- **A stiff strip pinned at both ends** should hang in a catenary. The sag is
  within 3%.
- **A tube 10% too small, pulled over a cylinder,** should stretch by the
  girth difference and press on the cylinder by Laplace's law (pressure equals
  tension divided by radius). The stretch matches. The contact force the
  solver itself measures only gets close to Laplace as the time step shrinks:
  0.46, 0.77, then 0.95 of the exact value. One XPBD iteration makes a
  constraint softer by 1/(1 + k·w·dt²). So the page computes pressure by
  Laplace's law from the simulated stretch, not from the raw contact force.

## What 24 drapes on one body show

The body: chest 100, waist 88, hip 98, height 178 cm, in a jersey preset.
Three garments, two cuts and four sizes (full table in the venture README):

- Stretch appears only when the tape ease (garment chest minus body chest) is
  zero or below, and then it roughly equals the shortfall. A slim XS tee, with
  a 90 cm garment chest on a 100 cm chest, stretches 12.3% around the chest.
  At −4 cm of ease the stretch is 4.9%.
- Extra width doesn't spread into an even gap. With 12 to 28 cm of ease, the
  average gap at the chest levels off at 1.5 to 1.9 cm. Gravity lays the cloth
  on the chest and shoulder blades, and the extra falls into folds at the
  sides.
- An unstretched garment ends 5.7 to 7.8 cm above a straight drop of its
  length. A tight one ends lower, because the stretched cloth pulls down.

## What it is not yet

It simulates the body panels only: no sleeves, no arms under the armholes, no
hood and no rib bands. The body is made of smooth ellipses. The knit has the
same stiffness in both directions, which real jersey doesn't. The fabric
stiffness presets are rough guesses, not lab measurements. Where the cloth is
tight the stretch comes from the body and hardly depends on that guess, but the
pressure scales directly with it. Nothing here has been compared with a real
garment on a real person. The next steps are sleeves sewn into the armholes,
a strip test on real jersey, and one real tee on one real person to check the
hem figure.

Try it: [virtual drape](https://marisstella.app/clothing-design-studio/drape.html).
The source and tests are in `ventures/clothing-design-studio/drape.mjs` and
`drape.test.mjs`, MIT licensed.
