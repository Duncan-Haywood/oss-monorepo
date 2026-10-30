"""Milestone 2: milestone 1's box with the placeholder wave term replaced by Michell thin-ship theory.

    PYTHONPATH=src python3 experiments/run_michell.py > experiments/results_michell.txt

Hulls are Wigley forms; length L fixed, beam L/10 (monohull) or L/14 (demi-hull), draft from the
required volume. Viscous: ITTC 1957 line times (1 + k) on the exact Wigley wetted area.
"""
import itertools
import math
from marine_hull.hull import cf_ittc57, power_total, range_km, RHO_SEA, NU_SEA
from marine_hull.michell import wave_resistance_wigley, wigley_wetted

M, FB, HOTEL = 200.0, 0.25, 30.0
VOL = M / RHO_SEA
SPEEDS = [i / 20.0 for i in range(10, 61)]
LB = {1: 10.0, 2: 14.0}


def hull(length, n):
    vol = VOL / n
    beam = length / LB[n]
    draft = 9.0 * vol / (4.0 * length * beam)
    return length, beam, draft, wigley_wetted(length, beam, draft)


def tables(length, n, sep_ratio):
    """Per speed: (viscous-area-based pieces, wave resistance N for the whole craft)."""
    l, b, t, s = hull(length, n)
    out = []
    for u in SPEEDS:
        rw = wave_resistance_wigley(u, l, b, t, n_hulls=n, sep=sep_ratio * l)
        out.append((u, rw))
    return s, out


def best(length, n, sep_ratio, k, interf, wscale, e_batt, cache):
    key = (length, n, sep_ratio)
    if key not in cache:
        cache[key] = tables(length, n, sep_ratio)
    s, rows = cache[key]
    wh = M * FB * e_batt
    top = (0.0, 0.0, 0.0)
    for u, rw in rows:
        re = u * length / NU_SEA
        rv = n * 0.5 * RHO_SEA * u * u * s * (1 + k + interf) * cf_ittc57(re)
        r = rv + wscale * rw
        km = range_km(wh, u, r, p_hotel=HOTEL)
        if km > top[0]:
            top = (km, u, wscale * rw / rv)
    return top


if __name__ == "__main__":
    cache = {}
    AX = dict(k_mono=[0.10, 0.25, 0.40], k_cat=[0.10, 0.25, 0.40], interf=[0.0, 0.15, 0.30],
              l_mono=[3.0, 4.0, 5.0], l_cat=[3.0, 4.0, 5.0], sep=[0.15, 0.25, 0.40],
              wscale=[0.5, 1.0, 1.5], e_batt=[150.0, 200.0, 250.0])
    rows = []
    for km_, kc, itf, lm, lc, sp, w, e in itertools.product(*AX.values()):
        mono = best(lm, 1, 0.0, km_, 0.0, w, e, cache)
        cat = best(lc, 2, sp, kc, itf, w, e, cache)
        rows.append((km_, kc, itf, lm, lc, sp, w, e, mono, cat))
    n = len(rows)
    win = lambda r: r[9][0] > r[8][0]
    print(f"cases {n}; catamaran out-ranges monohull in {sum(map(win, rows))} ({100*sum(map(win, rows))/n:.1f}%)")
    for ws in AX["wscale"]:
        sub = [r for r in rows if r[6] == ws]
        eq = [r for r in sub if r[3] == r[4]]
        print(f"wscale {ws}: wins {sum(map(win, sub))}/{len(sub)} ({100*sum(map(win, sub))/len(sub):.1f}%); equal length {sum(map(win, eq))}/{len(eq)}")
    rat = sorted(r[9][0] / r[8][0] for r in rows)
    print(f"range ratio cat/mono: min {rat[0]:.2f} median {rat[n//2]:.2f} max {rat[-1]:.2f}")
    mr = sorted(r[8][0] for r in rows)
    print(f"monohull best range km: min {mr[0]:.0f} median {mr[n//2]:.0f} max {mr[-1]:.0f}")
    print(f"monohull best speed m/s: median {sorted(r[8][1] for r in rows)[n//2]:.2f}; max {max(r[8][1] for r in rows):.2f}")
    wf = sorted(r[8][2] for r in rows)
    print(f"mono wave/viscous at best speed: median {wf[n//2]:.3f}, 90th pct {wf[int(.9*n)]:.3f}, max {wf[-1]:.3f}; share under 0.10: {sum(1 for x in wf if x<0.10)/n:.3f}")
    wc = sorted(r[9][2] for r in rows)
    print(f"cat wave/viscous at best speed: median {wc[n//2]:.3f}, 90th pct {wc[int(.9*n)]:.3f}, max {wc[-1]:.3f}")
    for i, name in enumerate(AX):
        out = []
        for val in AX[name]:
            sub = [r for r in rows if r[i] == val]
            out.append(f"{val}: {100*sum(map(win, sub))/len(sub):.1f}%")
        print(f"cat win share by {name}: " + ", ".join(out))
    # placeholder vs Michell at one hull, Froude sweep
    from marine_hull.hull import wave_resistance_fraction, froude_length
    s, tb = tables(4.0, 1, 0.0)
    print("4 m monohull: Fr, Michell wave/viscous (k=0.25), milestone-1 placeholder fraction")
    for u, rw in tb[::10]:
        rv = 0.5 * RHO_SEA * u * u * s * 1.25 * cf_ittc57(u * 4.0 / NU_SEA)
        print(f"  u={u:.2f} m/s Fr={froude_length(u, 4.0):.3f}  {rw/rv:.4f}  {wave_resistance_fraction(froude_length(u, 4.0)):.4f}")
