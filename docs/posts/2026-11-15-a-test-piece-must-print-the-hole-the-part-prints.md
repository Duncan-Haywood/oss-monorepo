---
title: "A test piece has to print the hole the part prints"
seo_title: "Bearing press fit in 3D prints: test in the part's print orientation"
date: 2026-11-15
tags: [open-tennis-robots, hardware, mechanical, cad, 3d-printing]
description: "The tennis feeder's bearing test ring now stands up so its bores print sideways like the boot's, with one bore in the press window per printer."
---

Earlier today the open tennis-ball feeder got a
[test ring](2026-11-15-a-test-ring-before-the-bearing-pocket.md) for the two
F626 bearings its lift shaft runs in. A printed hole comes out smaller than
drawn, by an amount no drawing can know, so you print a ring of pockets in
steps, press a bearing into each, and set the boot's pocket size from the one
that fits. Two sessions built that ring at the same time. Comparing them turned
up two mistakes in the first one, and the merged version fixes both.

**The ring has to print the same hole as the boot.** The boot prints floor
down. Both bearing pockets have horizontal axes, so the printer builds each
bore out of stacked layers: stair-stepped at the sides, and bridged and
sagging at the top. The first ring was seven discs lying flat on the bed. A flat
disc's bore is one smooth loop of perimeter in every layer, which is a
different hole, and usually a truer one. If you calibrate on it you measure the
wrong thing. The ring is now an upright wall 6 mm thick, standing on a foot,
and its six bores print sideways the way the boot's pockets do.

**The window is narrower than the printers.** Treat the bearing's steel ring
as rigid and the PETG round it as a thick-walled cylinder (Lamé). Then a lasting
press fit has a floor and a ceiling:

- *Floor, 0.023 mm on the diameter.* PETG expands about five times as fast as
  steel. 25 K of warming, from the sun or the gearmotor next to the bearing,
  takes back that much interference. A bore that is only just tight goes
  slack on a warm afternoon.
- *Ceiling, 0.120 mm.* Past that, the hoop stress at the bore passes 10 MPa,
  the sustained allowance the rest of the machine's printed parts use, and
  PETG creeps. The first ring checked against 45 MPa yield. That is the right
  limit for a crack on the day you press the bearing in, but the wrong one for
  a part that has to hold for months.

A sideways-printed 19 mm hole comes out somewhere from 0 to 0.35 mm small. It
depends on the printer, the slicer and whether hole compensation is on. That
spread is three times the window, so no drawn size fits every printer. A
test sweeps every size from -0.10 to +0.20 mm over and finds none that is a
press fit on all five printers.

**Steps chosen so every printer gets a bore in the window.** The first ring ran
0 to 0.15 mm a side over. On a printer with hole compensation (holes on size),
its tightest bore gives zero interference, which is under the floor, so that
printer had no good bore at all. The new steps are -0.03, 0.00, 0.03, 0.05,
0.08 and 0.12 mm a side. The first is drawn under the bearing's size. The
widest gap between steps, 0.08 mm on the diameter, is narrower than the
0.097 mm window, so every printer swept gets at least one bore in it:

| Printer's holes come out | Bores that press and stay tight |
| --- | --- |
| on size | -0.03 |
| 0.05 mm small | -0.03, 0.00 |
| 0.15 mm small (assumed) | 0.03, 0.05 |
| 0.25 mm small | 0.08 |
| 0.35 mm small | 0.12 |

The build checks this on every package. It fails if the steps are further
apart than the window, or if any swept printer has no bore in it.

**Reading the ring is a command.** Press a spare bearing into each bore and
write down one word per bore, tightest first: *drops, slides, presses, hard,
cracks*. Then run

```
python -m otr_cad fit-ring hard hard presses presses slides drops
```

It takes the middle of the bores the bearing pressed into, so there is a step
of margin both ways, towards slack when warm and towards creep. It then prints
the rebuild command, here `--set lift_bearing_fit_mm=0.03`. It needs none of
the CAD libraries installed.

**One more thing the model showed.** The boot is stiffer round its pockets than
a ring cell is. In the CAD it is 90-96% solid out to 33 mm from the axis, where
a ring cell has 22 mm. So the same bore presses about 18% firmer in the boot,
and the hoop check is made on the boot. The pressure also squeezes the
bearing's outer ring: about 2 µm at the drawn size, against the 2-13 µm of
internal clearance in a standard (CN) F626. If the ring's pick lands on its
tightest pressing bore, buy C3 bearings.

Nothing here has been printed or pressed yet. Every PETG figure is an
assumption, and the ring is there to replace the assumptions with your
printer's numbers. The CAD, the ring's STL and the full write-up are in the
[open-tennis-robots](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/open-tennis-robots)
venture, `cad/README.md`, "Bearing fit test ring".
