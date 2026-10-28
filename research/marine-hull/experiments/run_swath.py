"""Milestone 5 (SWATH rung): can a twin-lobe SWATH out-range the displacement monohull at 200 kg, 25% battery?

    PYTHONPATH=src python3 experiments/run_swath.py > experiments/results_swath.txt

SWATH: marine_hull.swath (Michell on lobes and struts, ITTC friction on spheroid lobes and struts).
Monohull: milestone 2's Wigley model, 4 m, k = 0.25, scale 1. Same battery, hotel load (30 W), efficiencies and
speed grid (0.5 to 3 m/s) as milestones 1 and 2.
"""
import itertools
from marine_hull.swath import swath_parts
from marine_hull.hull import range_km
import run_michell as rm

SEP = 0.25


def swath_best(length, hd, t, k, wscale, wh, cache):
    top = (0.0, 0.0, 0.0)
    for u in rm.SPEEDS:
        key = (length, hd, t, u)
        if key not in cache:
            cache[key] = swath_parts(u, rm.VOL, length, hd, t, 0.5, SEP, 0.0)[1]
        rv = swath_parts(u, rm.VOL, length, hd, t, 0.5, SEP, k, with_wave=False)[0]
        r = rv + wscale * cache[key]
        km = range_km(wh, u, r, p_hotel=rm.HOTEL)
        if km > top[0]:
            top = (km, u, wscale * cache[key] / r)
    return top


if __name__ == "__main__":
    AX = dict(length=[3.0, 4.0, 5.0], hd=[1.5, 2.0, 3.0], t=[0.04, 0.08], k=[0.10, 0.25, 0.40],
              wscale=[0.5, 1.0, 1.5], e_batt=[150.0, 200.0, 250.0])
    cache, mcache, rows = {}, {}, []
    for length, hd, t, k, w, eb in itertools.product(*AX.values()):
        wh = rm.M * rm.FB * eb
        s = swath_best(length, hd, t, k, w, wh, cache)
        m = rm.best(4.0, 1, 0.0, 0.25, 0.0, 1.0, eb, mcache)
        c = rm.best(4.0, 2, 0.25, 0.25, 0.15, 1.0, eb, mcache)
        rows.append((length, hd, t, k, w, eb, s, m, c))
    n = len(rows)
    wm = [r for r in rows if r[6][0] > r[7][0]]
    wc = [r for r in rows if r[6][0] > r[8][0]]
    print(f"cases {n}; SWATH out-ranges monohull in {len(wm)} ({100*len(wm)/n:.2f}%); out-ranges catamaran in {len(wc)} ({100*len(wc)/n:.2f}%)")
    rat = sorted(r[6][0] / r[7][0] for r in rows)
    print(f"range ratio SWATH/mono: min {rat[0]:.3f} median {rat[n//2]:.3f} max {rat[-1]:.3f}")
    print(f"SWATH best range km: min {min(r[6][0] for r in rows):.0f} median {sorted(r[6][0] for r in rows)[n//2]:.0f} max {max(r[6][0] for r in rows):.0f}; monohull median {sorted(r[7][0] for r in rows)[n//2]:.0f}; catamaran median {sorted(r[8][0] for r in rows)[n//2]:.0f}")
    print(f"SWATH best speed m/s median {sorted(r[6][1] for r in rows)[n//2]:.2f}; wave share of resistance at best speed median {sorted(r[6][2] for r in rows)[n//2]:.4f}")
    for ax, vals in (("length", AX["length"]), ("hd", AX["hd"]), ("wscale", AX["wscale"]), ("t", AX["t"])):
        idx = {"length": 0, "hd": 1, "t": 2, "wscale": 4}[ax]
        for v in vals:
            sub = [r for r in rows if r[idx] == v]
            print(f"  {ax}={v}: median ratio SWATH/mono {sorted(r[6][0]/r[7][0] for r in sub)[len(sub)//2]:.3f}; wins {sum(1 for r in sub if r[6][0] > r[7][0])}/{len(sub)}")
    b = max(rows, key=lambda r: r[6][0] / r[7][0])
    print("best SWATH/mono case:", dict(zip(list(AX), b[:6])), f"SWATH {b[6][0]:.0f} km at {b[6][1]:.2f} m/s; mono {b[7][0]:.0f} km")
