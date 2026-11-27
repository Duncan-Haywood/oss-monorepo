---
kind: note
date: 2026-11-27
---
# wall-framing-takeoff (bet #6): roof lines over outlines with angled sides

Landed in private-monorepo PR #487 (`apps/wall-framing-takeoff`, claim
`claim/wall-framing-takeoff/angled-outline-roof-lines`).

## What changed

- `skeleton.mjs` (new): `skeletonRoofLines(points, pitch)`, the straight skeleton of any simple
  counter-clockwise polygon at one pitch. It returns the same shape as `hiproof.mjs`'s
  `hipRoofLines`: lines with z, ridge, hip and valley totals, peak and volume. The wavefront moves
  to the next event (a side shrinking to nothing, or a corner reaching a side). Then `rebuild`
  welds corners, splits sides at corners lying on them, removes stretches traced both ways (those
  are ridges), and traces the rest turning furthest left. Each side keeps its original eave line,
  so the corner velocities stay exact. About 0.2 ms for a house outline, under 10 ms for 20
  random sides.
- `roofoutline.mjs`: `readAngledOutline`, `offsetAngledOutline` (mitred eave corners).
  `outlineRoof` falls back to these when `readOutline` refuses a side that is not square, and
  marks the result `angled: true`. `roofFromOutline` gives a clear reason.
- `hipframe.mjs` and `outlinesheathing.mjs` refuse an eave line with angled sides, with a reason.
  Before this they would have run `Math.sign` on the side directions and laid out a wrong roof.
- `eaves.mjs`: eave runs use `Math.hypot`. This is identical for square sides.
- Page: the shape label, the outline help text and the note under the plan. `eval-roof-plan-click.mjs`
  had a check that a slanted side is refused; it now checks that one is drawn and that a
  self-crossing outline is refused. New browser check: `eval-angled-roof-click.mjs`.

## How it was checked

`skeleton.test.mjs` (7 tests):

- It matches `hiproof.mjs` on 300 random square-cornered outlines, as drawn, rotated and mirrored.
  Agreement was within 5e-13 in a scratch run.
- The octagon and the clipped rectangle match their closed forms, and the bay was worked by hand.
- On 600 random star polygons (each angular gap under 180 degrees, so they are simple) and 200
  clipped outlines, each line end is inside the outline, its height is no more than its distance
  to the walls, and it lies on at least two sides' planes. Each corner has exactly one line.

The full suite (1,317 tests) passes. biome does not cover this app.

A trap for the next run: the first fuzz generator made self-crossing "star" polygons when a gap
between angles was over 180 degrees. Every failure was that, not the solver.

## Next

- Rafters and sheathing courses on angled planes. `hipframe.mjs` and `outlinesheathing.mjs` assume
  axis-aligned sides throughout (`frame()`, `Math.sign`).
- A DXF exterior loop with angled walls (`dxf.mjs`'s `rectWalls` is rectangular).
- Proof against a real measured roof is still the open item 7 in the ROADMAP.
