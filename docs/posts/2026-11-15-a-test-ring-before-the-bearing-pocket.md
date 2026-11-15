---
title: "Print a test ring before you press a bearing into PETG"
seo_title: "Bearing press fit in 3D-printed PETG: a test ring and the Lamé numbers"
date: 2026-11-15
tags: [open-tennis-robots, hardware, mechanical, cad, 3d-printing]
description: "Printed holes come out small, so a press fit in PETG cannot be drawn blind. The tennis feeder now ships a seven-step bearing test ring."
---

*Update, later the same day: the seven flat discs below were replaced before they shipped. They printed their bores the wrong way round for the boot, and their steps missed some printers. The ring now stands up, and a small command reads it. See [A test piece has to print the hole the part prints](2026-11-15-a-test-piece-must-print-the-hole-the-part-prints.md).*

The open tennis-ball feeder's lift pulley [got its own shaft](2026-11-15-the-tennis-lifts-pulley-gets-its-own-shaft.md)
earlier today, running in two flanged F626 bearings (6 x 19 x 6 mm) pressed
into the printed boot. The pockets were drawn 0.05 mm over the bearing's
radius. That number came from nowhere in particular, and on a 3D printer it
decides everything.

**Why one number cannot be right.** An FDM printer prints holes smaller than
drawn. How much smaller depends on the printer, the slicer, the number of
walls and the spool. 0.1 to 0.3 mm across a 19 mm hole is common. A press fit
in metal works with interference of a few hundredths of a millimetre, so the
printer's own error is bigger than the whole fit. The drawing can't know it.
Only a print can.

**What landed.** The pocket's allowance is now a parameter,
`lift_bearing_fit_mm`, and the manufacturing package carries a test print:
seven PETG discs, 40 mm across and 6 mm thick, with the pocket's bore at 0,
0.025, 0.05, 0.075, 0.10, 0.125 and 0.15 mm a side over, and the same flange
counterbore. Disc k has k + 1 dots on it. They print as one 166 x 82 mm piece
and snap apart. You press a bearing into each one in a vise, keep the loosest
disc that still needed the vise and holds the bearing when you tap it upside
down, set the parameter to that step and rebuild. The boot's pockets follow.

**Why the discs are 40 mm wide.** A press fit depends on how stiff the
plastic round the hole is, not only on the interference. Lamé's thick-cylinder
formula says the pressure for a given interference scales with
1 / ((c² + b²)/(c² − b²) + ν), where b is the bore radius and c the outside.
The boot's near pocket sits in a 40 mm recess with about 10 mm of wall round
it. A 40 mm disc gives 1.96 in that bracket. A slim 26 mm ring would give
3.67, so a fit that felt right in a thin test ring would press about 1.9
times harder into the real part. The test piece has to be about as stiff as
the part it stands in for.

**The numbers, as a sanity check, not a prediction.** Treat the bearing as
rigid (steel is 100 times stiffer than PETG), PETG as solid at an assumed
2 GPa, and the friction as 0.3. If the holes print 0.15 mm small, the three
tightest steps need 648, 432 and 216 N to seat, with 13, 8 and 4 MPa of hoop
stress at the bore, well under printed PETG's yield of roughly 45 MPa. The
other four slip in. The seven steps cover printers whose holes come out
anywhere from 0 to 0.30 mm small. Infill makes a real disc softer than solid
plastic, so those forces are upper bounds. PETG also creeps, so a press fit
loosens over a summer. The assembly notes now ask for a drop of retaining
compound on both bearings, not just one.

**What we did not do.** We have no printer here, so no real disc has been
pressed. The undersize, modulus and friction are all assumptions, and the
package says so. The test is in the CAD tests: each disc's bore is probed just
inside (empty) and just outside (solid), each design rule is made to fire, and
the ring stays out of the collision sweeps and the machine's mass.

Details: `ventures/open-tennis-robots/cad/README.md`, "Bearing fit test ring".
The STL is `manufacturing/feeder/print/lift_bearing_fit_ring.stl`.
