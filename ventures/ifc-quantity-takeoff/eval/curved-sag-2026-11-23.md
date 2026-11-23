# Curved faces: the flat triangles' sag added back, 2026-11-23

**Question.** [turned-figure-2026-11-23.md](turned-figure-2026-11-23.md) left
five advanced breps disagreeing with IfcOpenShell by more than 0.1% for no
named cause, all light here by 0.17-0.29% (kleine_Wohnung #207997, ruled
B-spline; FM_ARC_DigitalHub #127419/#128178, B-spline; #123731/#134031,
surface of revolution), and called them tessellation gaps. Are they, and can
this tool close them without meshing finer?

**Data.** The same two models (`ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/`, blob-less sparse clone) and the committed
IfcOpenShell reference JSONs of 2026-11-23 (no re-meshing needed). Full
output: [curved-sag-2026-11-23.txt](curved-sag-2026-11-23.txt).

## It was tessellation: error in step with the tolerance

The five breps measured with the surface mesher's tolerance (2e-4 of the
face's size) changed by hand:

| tolerance | #207997 | #127419 | #123731 |
|---|---:|---:|---:|
| 1e-3 | -0.563% | -1.453% | -1.492% |
| 2e-4 (shipped) | -0.213% | -0.170% | -0.292% |
| 1e-4 | -0.170% | -0.092% | -0.144% |
| 5e-5 | -0.142% | -0.037% | -0.073% |

On the FM_ARC_DigitalHub four the shortfall halves with the tolerance: flat
triangles inside a convex patch, light by about the sag times the area.
Sampling the B-spline edges 64 to a span instead of 16 moved nothing. Meshing
finer would close them, but 5e-5 takes 3-4 times as long and 2e-5 runs past
the 60,000-triangle cap on one face.

## The fix: each triangle's quadratic part

`surfaceTriangles` now marks every triangle with its edges' sag (the surface
at the middle of the edge in (u, v), less the middle of the surface's own
chord). `bulgeVolume` adds, over each triangle of vector area N, the volume
the quadratic patch through its six points encloses beyond the flat
triangle: (d1 + d2 + d3) · N / 3, because a six-node triangle's shape
functions integrate to 0 at the corners and a third of the area at each
edge's middle. It sums on the oriented shells, so a face the shell turns to
match its neighbours turns its share too; an open shell is left as it was.
The mesh itself is unchanged (areas, sections and the viewer read it as
before); only the volume gains the term.

With it, the tolerance hardly matters any more:

| tolerance | #207997 | #127419 | #123731 |
|---|---:|---:|---:|
| 1e-3 | -0.116% | +0.008% | -0.001% |
| 2e-4 (shipped) | -0.117% | +0.012% | +0.003% |
| 5e-5 | -0.117% | +0.012% | +0.003% |

## Results on both models

| | kleine_Wohnung | FM_ARC_DigitalHub |
|---|---:|---:|
| Agree within 0.1% (raw IfcOpenShell figure) | 708 to 708 | 1267 to 1271 |
| Agree within 0.1% (IfcOpenShell turned where its faces are inside out) | 761 to 761 | 1302 to 1309 of 1309 read |
| Unexplained | 1 to 1 | 4 to 0 |
| Breps whose volume changed | 8 (7 closer, 1 further) | 17 (16 closer, 1 further) |
| Largest change | 0.097% | 0.296% |

Against the right IfcOpenShell figure, every brep read on FM_ARC_DigitalHub
now agrees within 0.1%. The seven newly agreeing are the four of the
question plus #130735 (0.298% to 0.003%) and #123495/#133795 (0.175% to
0.024%), which an earlier reason had already named. The two that moved
further stay well inside the line (kleine_Wohnung #162827 0.016% to 0.035%,
FM_ARC_DigitalHub #134916 0.017% to 0.047%): IfcOpenShell's own mesh is
inscribed at 0.05 mm, so a correct figure sits a little above it.

**What is left.** kleine_Wohnung #207997 is 0.117% light at every
tolerance from 1e-3 to 5e-5, so it is not this tool's mesh. Its B-spline
edges sit about 2e-4 of the face's size off the circular surface they bound
(the reason the bound check allows 1e-3); whether that, or IfcOpenShell,
accounts for the 0.12% is not settled here.

**Speed.** Since the volume no longer depends on the tolerance, it could be
loosened (1e-3 gives the same volumes within 0.01% at a third of the time).
Not done: areas and sections still read the flat triangles, and their error
is still the sag.

## Tests

`surface.test.mjs`: the half cone frustum now agrees with its formula to 1e-6
(was 0.034% light), the quarter torus to 2e-5 (was 0.12% light, asserted
light), and a new case writes the frustum's curved face backwards to check
the term turns with the face. All three fail on the code before this change.
`python3 platform/ci/run_venture_tests.py ifc-quantity-takeoff`: 236 tests
pass.
