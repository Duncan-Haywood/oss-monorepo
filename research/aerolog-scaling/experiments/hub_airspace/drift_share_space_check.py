"""Milestone 11al, post hoc (written after drift_share_stats_results.txt): is the space part's linear-in-distance
scaling plausible? The sd of the centred simultaneous QNH difference for every pair of the five ISD stations against
their distance, with a least-squares fit sd = a + b d and sd = b d. Needs numpy.

    python3 drift_share_space_check.py > drift_share_space_check_results.txt
"""
import itertools
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import drift_share as ds  # noqa: E402

isd = ds.load_isd()
t = np.arange(ds.MAX_GAP_MIN, ds.YEAR_MIN, 10.0)
rows = []
print("# centred simultaneous QNH difference between ISD stations, 2014, every 10 min; sd in m (x 8.32 m/hPa)")
for a, b in itertools.combinations(sorted(isd), 2):
    x = ds.interp(isd[a][0], isd[a][1], t) - ds.interp(isd[b][0], isd[b][1], t)
    x = x[np.isfinite(x)]
    d = ds.haversine_km(isd[a][2], isd[b][2])
    sd = float(np.std(x)) * ds.M_PER_HPA
    rows.append((d, sd))
    print("  %s - %s  %5.1f km  sd %.3f m  (%.3f hPa)  sd/km %.3f m" % (a, b, d, sd, sd / ds.M_PER_HPA, sd / d))
d, s = np.array(rows).T
A = np.vstack([np.ones_like(d), d]).T
(a0, b0), *_ = np.linalg.lstsq(A, s, rcond=None)
b1 = float((d @ s) / (d @ d))
print("fit sd = a + b d: a %.3f m, b %.4f m/km; fit sd = b d: b %.4f m/km (main model's JFK-LGA slope %.4f)" % (
    a0, b0, b1, [r[1] / r[0] for r in rows if abs(r[0] - 18.5) < 1.0][0] if any(abs(r[0] - 18.5) < 1.0 for r in rows) else float('nan')))
print("at 3.8 km (median hub separation): a + b d = %.3f m, b d = %.3f m" % (a0 + b0 * 3.8, b1 * 3.8))
