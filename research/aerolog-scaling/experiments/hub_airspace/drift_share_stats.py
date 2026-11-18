"""Milestone 11al, statistics (P1, P2, P4 in drift_share.py's docstring). Needs numpy.

    python3 drift_share_stats.py > drift_share_stats_results.txt
Mission times from the 48 layouts, the pressure part of the gap error for every operator pair, the per-drone
(independent) drift s0 at the same ages, and the dwell and sqrt(d) sensitivities."""
import importlib.util
import math
import os
import statistics as S
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import drift_share as ds  # noqa: E402

spec = importlib.util.spec_from_file_location("hub_airspace_random_layouts_11al", os.path.join(HERE, "random_layouts.py"))
rl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rl)
SIZES = {12: range(1200, 1224), 16: range(1600, 1624)}
N = 2000                  # draws per pair here (the planner run uses ds.N_MC)


def layout_missions(pts, idx, m, dwell=0.0):
    """Per operator: (hub, mission minutes to each destination)."""
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx, m)
    out = []
    for h, r, v in zip(hubs, radii, speeds):
        mine = [(x, y) for x, y in pts if 0 < (x - h[0]) ** 2 + (y - h[1]) ** 2 <= r * r]
        out.append((h, ds.mission_minutes(h, mine, v, dwell)))
    return out, shares


def pair_stats(rng, isd, ops, mission, space_pow=1.0, main="JFK"):
    """sd of the pressure part per pair (i <= j), of its space part alone (i < j), and s0 per operator."""
    tot, space, s0, dists = [], [], [], []
    for i in range(len(ops)):
        ai = ds.drone_ages(rng, N, mission, ops[i][1])
        s0.append(float(np.std(ds.drift_samples(rng, isd, ai, main))))
        for j in range(i, len(ops)):
            aj = ds.drone_ages(rng, N, mission, ops[j][1])
            d = math.dist(ops[i][0], ops[j][0]) / 1000.0
            tot.append(float(np.std(ds.gap_samples(rng, isd, ai, aj, d, main, space_pow=space_pow))))
            if j > i:
                z = np.zeros(N)
                space.append(float(np.std(ds.gap_samples(rng, isd, z, z, d, main, space_pow=space_pow))))
                dists.append(d)
    return tot, space, s0, dists


def main():
    isd = ds.load_isd()
    pts = rl.load_nyc(10000.0)
    rng = np.random.default_rng(11)
    P = print
    P("# Milestone 11al statistics (drift_share.py): NOAA ISD 2014 QNH at JFK (time part) and the centred JFK - LGA")
    P("# simultaneous difference scaled to the hub separation (space part); %d draws per operator pair" % N)
    P("# sd in metres; 'pair' = pressure part of one pair's gap error (time + space); s0 = one drone's take-off drift")
    P("# (11ak's S0) at the same ages; indep = sqrt(2) s0, the pair sd if the drifts were independent")
    for dwell in (0.0, 5.0):
        for m in (12, 16):
            mt, tot, sp, s0, dd, ratio = [], [], [], [], [], []
            for idx in SIZES[m]:
                ops, _ = layout_missions(pts, idx, m, dwell)
                mt += [float(np.median(t)) for _, t in ops]
                a, b, c, d = pair_stats(rng, isd, ops, "deliv")
                tot += a
                sp += b
                s0 += c
                dd += d
            P()
            P("## deliv, dwell %g min, M = %d (24 layouts)" % (dwell, m))
            P("  median mission time per operator: median %.2f min (range %.2f..%.2f)" % (S.median(mt), min(mt), max(mt)))
            P("  pair pressure sd: median %.3f (p90 %.3f, max %.3f) m over %d pairs" % (
                S.median(tot), float(np.quantile(tot, 0.9)), max(tot), len(tot)))
            P("  space part sd (cross pairs): median %.3f (max %.3f) m; hub separation median %.1f km (%.1f..%.1f)" % (
                S.median(sp), max(sp), S.median(dd), min(dd), max(dd)))
            P("  s0 per operator: median %.3f m; indep pair sd sqrt(2) s0: median %.3f m" % (
                S.median(s0), math.sqrt(2) * S.median(s0)))
    P()
    P("## long missions, layout hubs of the 24 M = 12 layouts (ages uniform on [0, T])")
    for mission in ("T30", "T60"):
        for pw in (1.0, 0.5):
            tot, sp, s0 = [], [], []
            for idx in list(SIZES[12])[:8]:
                ops, _ = layout_missions(pts, idx, 12)
                a, b, c, _ = pair_stats(rng, isd, ops, mission, space_pow=pw)
                tot += a
                sp += b
                s0 += c
            P("  %s space ~ d^%g: pair sd median %.3f m (max %.3f); space part median %.3f; s0 median %.3f; "
              "pair / indep %.3f  (8 layouts)" % (mission, pw, S.median(tot), max(tot), S.median(sp), S.median(s0),
                                                   S.median(tot) / (math.sqrt(2) * S.median(s0))))
    P()
    P("## time part alone by station (same hub, ages uniform on [0, T]), and s0")
    for mission in ("T30", "T60"):
        for st in ds.load_isd():
            a, b = ds.drone_ages(rng, 20000, mission), ds.drone_ages(rng, 20000, mission)
            g = ds.gap_samples(rng, isd, a, b, 0.0, main=st)
            s0 = float(np.std(ds.drift_samples(rng, isd, a, main=st)))
            k = float(np.mean((g - g.mean()) ** 4) / np.var(g) ** 2 - 3)
            P("  %s %s: time-part sd %.3f m, excess kurtosis %.2f, P(>3 sd) %.4f; s0 %.3f; ratio to sqrt(2) s0 %.3f" % (
                mission, st, float(np.std(g)), k, float(np.mean(np.abs(g - g.mean()) > 3 * np.std(g))), s0,
                float(np.std(g)) / (math.sqrt(2) * s0)))


if __name__ == "__main__":
    main()
