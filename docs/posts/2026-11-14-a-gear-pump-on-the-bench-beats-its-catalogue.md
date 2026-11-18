---
title: "A gear pump on its maker's bench runs 0.15 better than its catalogue says"
seo_title: "Measured gear pump efficiency at 150 bar vs catalogue curves"
date: 2026-11-14
tags: [research, heavy-equipment, hydraulics, gear-pump, load-sensing, excavator, test-bench, fuel]
description: "A Casappa KP30 of 44 cm3/r, torque-metered on Casappa's bench, reaches 0.91 overall at 150 bar. Casappa's own catalogue curves put the same size at 0.76."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks whether a small excavator burns less fuel with a stock
load-sensing pump or with a smaller fixed gear pump on an open-centre
valve. The last three steps narrowed the answer to one number. A smaller
fixed pump wins in more than half of 384 cylinder-geometry readings if
a gear pump of about 40 cm³/r reaches about 0.82 to 0.83 overall efficiency
at 150 bar and 2100 r/min. Three makers' catalogues put that pump at 0.76
(Casappa), 0.85 (Danfoss) and 0.90 (Marzocchi), so the catalogues alone
fall on both sides of the threshold.

A catalogue curve is a selection aid, not a test. So this step looked for
a measurement.

**The source.** Frosina, Senatore and Rigosi (2017, *Energies* 10:1113,
open access) built a CFD model of a Casappa KP30 with 44 cm³/r
displacement, close to the size the excavator optimum picks. To validate
it they tested the pump on Casappa's own bench at 1000, 1500 and 2500 r/min
and 50, 150 and 250 bar, with a torque meter on the shaft and a flowmeter
on the outlet. The paper is about the model, so it reports no efficiency
figure. The measurements are only in the figures, and the figures are
raster images.

**Reading them.** A short stdlib script pulls the images out of the PDF,
fits each axis through its gridlines (to within half a pixel), and reads
the measured torque line as two straight segments, which meet at 150 bar
to within 0.03 Nm. Six predictions were written down before any pixel was
read. They were not blind: I had already looked at the figures, and the
log says so.

**What it found.** At 150 bar the pump absorbed 109 to 113 Nm. A
frictionless pump of 44 cm³/r would need 105 Nm. It delivered 0.967 to
0.981 of its ideal flow. At the excavator's 2100 r/min that comes to
**0.913 overall**. The least favourable of six alternative readings gives
0.881. For example, it takes the hydro-mechanical efficiency at 2500 r/min
and a volumetric efficiency of 0.95.

| at 150 bar, 2100 r/min | on the bench | Casappa catalogue, same size |
|---|---|---|
| shaft torque | 112 Nm | 131 Nm |
| overall efficiency | 0.913 | 0.764 |

So the one test found puts the pump well above the 0.82 to 0.83 threshold.
On that evidence a smaller fixed gear pump beats load-sensing on the small
excavator's fuel in at least 95% of the geometries tried. The bigger
surprise is the gap to the maker's own catalogue: at the bench's speeds
the catalogue's torque is 16 to 18% higher than the torque the bench
measured. If that holds for other pumps, catalogue curves are a
conservative and uneven input for sizing a fixed pump.

**What did not check out.** Three of the six predictions failed, all on
the paper's CFD model lines rather than the measurements. At 1500 and
2500 r/min the model torque sits 2 to 4% above the ideal torque. Measured
minus model also differs from the paper's own friction-torque figure by
about 2 Nm. Either the figures came from different model runs or the
model lines are not frictionless. At 1000 r/min the two figures agree to
0.04 Nm.

**Limits.** This is one unit, tested on its maker's bench and published in
a paper with a Casappa co-author. It is not an independent ISO 4409 test
report. The torque figure states no oil temperature. The paper's flowmeter
is rated to 80 L/min, yet the 2500 r/min flow is about 108 L/min, and the
paper does not explain this. The excavator fuel sweep was not rerun for
this pump. The 95% figure is a lower bound from the existing sweep.

Next: an independent test of a gear pump of 30 to 50 cm³/r, to tell
whether this unit is typical, and a rerun of the fuel sweep at the bench
efficiency.

Code and data: [`digitise_frosina_kp30.py`](../../research/heavy-hydraulics/experiments/digitise_frosina_kp30.py),
[`kp30_bench_results.txt`](../../research/heavy-hydraulics/experiments/kp30_bench_results.txt),
and the [research log](../../research/heavy-hydraulics/LOG.md).
