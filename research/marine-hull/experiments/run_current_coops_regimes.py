"""Milestone 4i: 4h's glider-against-AUV current test split by each station's own median current speed.

4h pooled 64 CO-OPS stations. Here stations are grouped by their observed median speed (a property of the data, not a
hand label): calm (median <= 0.2 m/s, the glider's speed), moderate (0.2 to 0.5), strong (> 0.5). Same glider/AUV cases and
the same two readings of the current against the transect as 4h.
Run: PYTHONPATH=src:experiments python3 experiments/run_current_coops_regimes.py > experiments/results_current_coops_regimes.txt
"""
import itertools, math
from marine_hull.glider import auv_energy_per_m
from run_slocum import GRID, glider_best
from run_remus import L, VOL, CS, P_TOTAL, FORM, ETA, prop_w
from run_current import ground, AUV_SPEEDS
from run_current_coops import load


def build():
    gkeys = [k for k in GRID if k != 'auv']
    glider = []
    for vals in itertools.product(*(GRID[k] for k in gkeys)):
        c = dict(zip(gkeys, vals))
        e, uh, _ = glider_best(c['cd0'], c['b_max'], c['eta_pump'], c['e_cycle'], c['hotel'])
        glider.append((e, uh))
    auvs = [(k, eta, pt - prop_w(k, eta)) for k, eta, pt in itertools.product(FORM, ETA, P_TOTAL)]
    cache = {}

    def at(vq):
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
    return at


def summarise(at, speeds):
    thetas = [(i + .5) * math.pi / 14 for i in range(7)]
    out = []
    for fr in ([1.0], [math.sin(t) for t in thetas]):
        stall = win = 0.0
        for s in speeds:
            for f in fr:
                a, b = at(min(int(round(s * f * 100)), 300))
                stall += a / len(fr); win += b / len(fr)
        out.append((100 * stall / len(speeds), 100 * win / len(speeds)))
    return out


def main():
    at = build()
    st = load()
    groups = {"calm (median <= 0.2 m/s)": lambda m: m <= 0.2,
              "moderate (0.2 < median <= 0.5)": lambda m: 0.2 < m <= 0.5,
              "strong (median > 0.5)": lambda m: m > 0.5}
    for name, f in groups.items():
        sub = [(s, v) for s, v in st if f(v[10])]
        speeds = [x for _, v in sub for x in v]
        if not speeds:
            print(name, "no stations"); continue
        (sw, ww), (sr, wr) = summarise(at, speeds)
        above = 100 * sum(x > 0.2 for x in speeds) / len(speeds)
        print(f"{name}: {len(sub)} stations; readings above 0.2 m/s {above:.1f}%")
        print(f"   worst case: glider stalls {sw:.1f}%, wins {ww:.1f}% | random heading: stalls {sr:.1f}%, wins {wr:.1f}%")


if __name__ == "__main__":
    main()
