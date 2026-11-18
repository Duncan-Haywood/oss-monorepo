"""Milestone 4g: milestone 4f's cross-current sweep, weighted by a sourced global surface-current distribution.

4f swept the cross-current 0 to 0.5 m/s with no source. Here the current speeds come from OSCAR (NASA/JPL, 1/3 degree,
5-day, 15 m): 13 dates in 2013 (every 6th composite), every 12th grid point (4 degrees), 60S to 60N, ocean points only,
fetched from NOAA CoastWatch ERDDAP `jplOscar` into experiments/data/oscar_{u,v}.csv. Each point is weighted by cos(latitude).
Two readings of the current against the transect: worst case (the whole speed is cross-track) and a random heading
(cross component |V| |sin t|, t uniform; evaluated on a 7-point grid of t).
Glider and AUV cases are 4f's (run_current.py). Run: PYTHONPATH=src:experiments python3 experiments/run_current_oscar.py > experiments/results_current_oscar.txt
"""
import csv, itertools, math, statistics
from marine_hull.glider import auv_energy_per_m
from run_slocum import GRID, glider_best
from run_remus import L, VOL, CS, P_TOTAL, FORM, ETA, prop_w
from run_current import ground, AUV_SPEEDS


def load():
    d = {}
    for name in 'uv':
        with open(f'experiments/data/oscar_{name}.csv') as f:
            rd = csv.reader(f); next(rd); next(rd)
            for t, _, la, lo, x in rd:
                d.setdefault((t, la, lo), {})[name] = float(x)
    out = []
    for (t, la, lo), c in d.items():
        if 'u' in c and 'v' in c and not (math.isnan(c['u']) or math.isnan(c['v'])):
            out.append((math.hypot(c['u'], c['v']), math.cos(math.radians(float(la)))))
    return out


def wq(pairs, p):
    pairs = sorted(pairs); tot = sum(w for _, w in pairs); acc = 0
    for x, w in pairs:
        acc += w
        if acc >= p * tot:
            return x


def main():
    pts = load()
    W = sum(w for _, w in pts)
    print(f"OSCAR points {len(pts)} (13 dates, 4-degree grid, 60S-60N, ocean only), cos(lat) weighted")
    print("speed m/s: weighted median %.3f, 75th %.3f, 90th %.3f, 95th %.3f, share above 0.2: %.1f%%, above 0.3: %.1f%%" % (
        wq(pts, .5), wq(pts, .75), wq(pts, .9), wq(pts, .95),
        100 * sum(w for s, w in pts if s > .2) / W, 100 * sum(w for s, w in pts if s > .3) / W))
    gkeys = [k for k in GRID if k != 'auv']
    glider = []
    for vals in itertools.product(*(GRID[k] for k in gkeys)):
        c = dict(zip(gkeys, vals))
        e, uh, _ = glider_best(c['cd0'], c['b_max'], c['eta_pump'], c['e_cycle'], c['hotel'])
        glider.append((e, uh))
    auvs = [(k, eta, pt - prop_w(k, eta)) for k, eta, pt in itertools.product(FORM, ETA, P_TOTAL)]
    cache = {}

    def at(vq):  # vq: cross-current in 0.01 m/s steps -> (stalled share, win share of all pairs)
        if vq not in cache:
            v = vq / 100
            ae = [min(ground(auv_energy_per_m(u, L, VOL, CS, k, h, eta=eta), u, v) for u in AUV_SPEEDS) for k, eta, h in auvs]
            st = wins = 0
            for eg, ug in glider:
                g = ground(eg, ug, v)
                st += ug <= v
                wins += sum(g < a for a in ae)
            cache[vq] = (st / len(glider), wins / (len(glider) * len(ae)))
        return cache[vq]

    thetas = [(i + .5) * math.pi / 14 for i in range(7)]
    for label, fr in (("worst case: whole current cross-track", [1.0]),
                      ("random heading: cross component |V| sin(t)", [math.sin(t) for t in thetas])):
        stall = win = 0.0
        for s, w in pts:
            for f in fr:
                a, b = at(min(int(round(s * f * 100)), 60))
                stall += w * a / len(fr); win += w * b / len(fr)
        print(f"{label}: glider cannot hold the track {100*stall/W:.1f}% ; glider has lower energy per ground metre than the AUV in {100*win/W:.1f}% of (ocean point, glider, AUV) triples")


if __name__ == "__main__":
    main()
