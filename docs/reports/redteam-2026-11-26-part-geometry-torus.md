---
kind: note
topics: [redteam]
date: 2026-11-26
---
# Red team 2026-11-26: machine-shop part reader and quote (part-geometry.mjs, quote.mjs)

Bet: job-shop quote (`portfolio/monetization/bets.md`, bet #2). The pages
`stock-size-from-step-file.html` and `job-shop-quote-calculator.html` in
`ventures/machine-shop-guides` are its front door. Neither file had been
campaigned before.

- Campaign 1, `part-geometry.mjs`: 10 mutants, 6 caught. Three escapes were in
  code **no fixture reached**: the spine arc that bounds a torus face (two
  mutants) and the square around a circle profile on a `SURFACE_OF_REVOLUTION`.
  The OCP fixtures (`fixtures/geometry/make_fixtures.py`) hold no
  `TOROIDAL_SURFACE` at all, though most fillets on real parts are tori. These
  were gaps. The new tests build the smallest STEP files that hold them (a
  half-tube torus face over 0..90 and -45..45 degrees of ring, and a revolved
  circle) and compare the box with a sampled closed form, in frames turned so
  the extreme lies inside the face, not on an edge. One escape (simple-instance
  unit entities) was triaged equivalent: conforming files type the length unit
  as a complex instance.
- Campaign 2, `quote.mjs`: 8 mutants, 5 caught. Gaps: the blank program-life
  default, and `DEFAULT_BREAKS`, which the page duplicates as its pre-filled
  `breaks` input. The new test pins the module default to the page's value so
  the two cannot drift apart.
- After the fixes, 17 of 17 non-equivalent mutants are caught (11 of 17 before).

Real defects (patched, tests first):

1. A binary STL with a triangle count of 0 (and so any file of 84 bytes or
   more whose bytes 80-83 are zero, which the reader takes for a binary STL)
   read as a size of NaN with no error. The page printed "NaN mm" and handed
   NaN on to the quote page. The empty ASCII STL already threw. It now throws
   too.
2. A NaN corner in an STL was silently dropped by the min and max, so a
   damaged file read as a smaller part. An infinite corner (a float32 overflow,
   or `1e400` in ASCII) or a STEP coordinate past the double range gave NaN.
   `parseStl` now refuses any non-finite coordinate, and `readPart` refuses a
   non-finite size or envelope whichever format it came from.

Checked and not a defect: the torus bound can overstate a face's inner side
by up to the tube radius. That is by design (the face lies within r of its
spine arc) and errs toward more stock, never less.

Next run: `fixtures/geometry/make_fixtures.py` could add a filleted part whose
fillet faces the kernel exports as tori, once a run has OCP available. That
would test the torus path against the kernel, not only the closed form.
