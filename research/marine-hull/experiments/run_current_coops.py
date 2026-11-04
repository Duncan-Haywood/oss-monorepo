"""Milestone 4h: 4g's glider-against-AUV current test on observed coastal currents (NOAA CO-OPS PORTS, Jan 2024).

4g used OSCAR (1/3 degree, 5-day, open ocean) and said it understates shelf and tidal currents. Here the speed
distribution is observed by ADCP/current meters at 64 CO-OPS stations (ports, channels, bay entrances, rivers; US only),
31 days of 6-minute readings each, summarised at percentiles 0..100 step 5 (experiments/data/coops_currents.csv, made by
fetch_coops_currents.py). Each station counts equally; each of its 21 percentile speeds carries equal weight. Same two readings
of the current against the transect as 4g (worst case, random heading) and the same glider and AUV cases as 4f/4g.
Run: PYTHONPATH=src:experiments python3 experiments/run_current_coops.py > experiments/results_current_coops.txt
"""
import csv, itertools, math
from marine_hull.glider import auv_energy_per_m
from run_slocum import GRID, glider_best
from run_remus import L, VOL, CS, P_TOTAL, FORM, ETA, prop_w
from run_current import ground, AUV_SPEEDS
from run_current_oscar import wq


def load(path='experiments/data/coops_currents.csv'):
    out = []
    for r in csv.DictReader(open(path)):
        out.append((r['station'], [float(r[f'p{p}']) for p in range(0, 101, 5)]))
    return out


def main():
    st = load()
    pts = [(s, 1.0) for _, v in st for s in v]
    W = sum(w for _, w in pts)
    print(f"CO-OPS stations {len(st)} (Jan 2024, 6-minute readings, median over depth bins), equal station weight")
    print("speed m/s: median %.3f, 75th %.3f, 90th %.3f, 95th %.3f, share above 0.2: %.1f%%, above 0.3: %.1f%%, above 0.5: %.1f%%" % (
        wq(pts, .5), wq(pts, .75), wq(pts, .9), wq(pts, .95),
        *(100 * sum(w for s, w in pts if s > x) / W for x in (.2, .3, .5))))
    gkeys = [k for k in GRID if k != 'auv']
    glider = []
    for vals in itertools.product(*(GRID[k] for k in gkeys)):
        c = dict(zip(gkeys, vals))
        e, uh, _ = glider_best(c['cd0'], c['b_max'], c['eta_pump'], c['e_cycle'], c['hotel'])
        glider.append((e, uh))
    auvs = [(k, eta, pt - prop_w(k, eta)) for k, eta, pt in itertools.product(FORM, ETA, P_TOTAL)]
    cache = {}

    def at(vq):  # cross-current in 0.01 m/s steps -> (stalled share, win share of all pairs)
        if vq not in cache:
            v = vq / 100
            ae = [min(ground(auv_energy_per_m(u, L, VOL, CS, k, h, eta=eta), u, v) for u in AUV_SPEEDS) for k, eta, h in auvs]
            stl = wins = 0
            for eg, ug in glider:
                g = ground(eg, ug, v)
                stl += ug <= v
                wins += sum(g < a for a in ae)
            cache[vq] = (stl / len(glider), wins / (len(glider) * len(ae)))
        return cache[vq]

    thetas = [(i + .5) * math.pi / 14 for i in range(7)]
    for label, fr in (("worst case: whole current cross-track", [1.0]),
                      ("random heading: cross component |V| sin(t)", [math.sin(t) for t in thetas])):
        stall = win = 0.0
        for s, w in pts:
            for f in fr:
                a, b = at(min(int(round(s * f * 100)), 300))
                stall += w * a / len(fr); win += w * b / len(fr)
        print(f"{label}: glider cannot hold the track {100*stall/W:.1f}% of readings ; glider has lower energy per ground metre than the AUV in {100*win/W:.1f}% of (reading, glider, AUV) triples")
    ok = sum(1 for _, v in st if v[10] <= 0.2)
    print(f"stations whose median speed is at or below 0.2 m/s (a glider could work there most of the time): {ok} of {len(st)}")


if __name__ == "__main__":
    main()
