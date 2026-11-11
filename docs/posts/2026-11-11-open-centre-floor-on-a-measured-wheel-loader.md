---
title: "How much energy does open-centre hydraulics waste? A floor from a measured wheel loader"
seo_title: "Open-centre vs load-sensing: energy floor on measured loader data"
date: 2026-11-11
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, wheel-loader, open-data]
description: "On a public 6 t wheel loader trace, any open-centre circuit needs at least 1.37x the load-sensing pump energy; about 1.54x and 14.7% more fuel centrally."
---

Earlier today the [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme ran its circuit model on its first measured machine: a public 440 s
trace of a 6 t load-sensing wheel loader loading gravel, published by Linjama,
Huova, Tammisto, Tervonen and Ahola at Tampere University
([Zenodo, CC BY 4.0](https://doi.org/10.5281/zenodo.10639199)). The
[earlier post](2026-11-11-measured-wheel-loader-load-sensing-vs-open-centre.md)
reported that an open-centre pump on the same motion would use 1.24 to 1.79
times the energy. The answer moved most with one number we had picked by hand
after a buggy first run: the flow below which a valve section counts as still.

That number is a property of the data, so this step measured it.

**The noise floor.** The dataset's flows are derived from piston velocity
through a 5 Hz filter, so a boom held still still shows small flows. In 1 s
windows where a cylinder moved less than 0.5 mm, the 99th percentile of the
flow channel is **0.80 L/min for the lift section and 1.76 L/min for tilt**.
Both are above what that much movement could explain (0.3 to 0.4 L/min), so
they are filter noise. The value depends on the window rule (0.3 to 4.5 L/min
across the nine rules we tried), and we report that spread.

**A floor that needs no valve model.** An open-centre valve can only feed a
cylinder if the pump pressure is above the cylinder's pressure, and a fixed
pump then pushes its whole flow out at that pressure, with the bypass taking
the rest. So whatever the bypass closing curve looks like, the open-centre
pump spends at least *full flow times load pressure* while anything moves.
Setting the extra spool drop to zero gives that floor.

**Results** (four predictions written in the
[log](../../research/heavy-hydraulics/LOG.md) before the run; all held):

| open-centre circuit on the measured motion | pump energy vs load-sensing | extra fuel |
|---|---|---|
| floor: no spool drop, 0 to 10 bar neutral drop | 1.37 to 1.43x | 9.7 to 11.5% |
| measured motion threshold, 10 bar spool drop | 1.54x (per cycle 1.46 to 1.63) | 14.7% |
| motion from piston position alone (1 mm in 0.5 s) | 1.51x | 13.8% |

So on this cycle load-sensing uses at most 73% of the pump energy of any
open-centre valve on the same 63 cc fixed pump, and about 65% at a typical
spool drop. Two independent definitions of "moving" (flow above the noise
floor, piston travel above 1 mm) agree to 0.03.

**What it does not show.** This is a wheel loader, not the small excavator the
programme is about. The open-centre machine is simulated on the measured
machine's motion; a real open-centre operator would drive differently. The
fuel figure uses a fuel-versus-power slope fitted to the ECU's own power
estimate. And the one published study of this data (Huova et al., 2018) sits
behind a paywall, so there is no outside fuel figure to check against yet.

Code and numbers:
[`measured_motion.py`](../../research/heavy-hydraulics/experiments/measured_motion.py),
[`measured_motion_results.txt`](../../research/heavy-hydraulics/experiments/measured_motion_results.txt).
The paper draft gains a section 3.6 with both steps, and every figure in it is
checked against the results files by `paper/check_numbers.py`.

*Research estimates from one public measurement, not engineering advice for a
specific machine.*
