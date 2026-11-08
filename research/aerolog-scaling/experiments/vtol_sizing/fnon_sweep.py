"""Milestone 10d: 10a's battery range with the non-energy fraction (structure + propulsion) fixed to the
NASA NDARC band 0.48 to 0.62 (10b, 10c; NTRS 20180003381), instead of 10a's assumed ~0.40.
Same energy model, 15% payload floor, 20% reserve as run.py; payload mass is large enough that the fixed
avionics mass m0 is negligible (m0 = 0 here)."""
import math
from run import fractions, G

def fe_for(R, e_cell, **kw):
    return fractions(R, e_cell, **kw)[2]

def max_range(e_cell, fnon, fmin=0.15, **kw):
    lo, hi = 0.0, 1500e3
    ok = lambda R: fnon + fe_for(R, e_cell, **kw) <= 1 - fmin
    if not ok(1.0):
        return 0.0
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if ok(mid) else (lo, mid)
    return lo / 1000.0

def need_energy(Rk, fnon, **kw):
    for cand in range(100, 3001):
        if max_range(cand, fnon, **kw) >= Rk:
            return cand
    return None

def main():
    # 10a base case non-energy fraction, for the reproduction check
    fs, fp, _ = fractions(1.0, 250)
    f10a = fs + fp
    print(f"10a base non-energy fraction fs + fp = {f10a:.3f}")
    fn = [round(f10a, 3), 0.48, 0.55, 0.62]
    print("\nA. One-way range (km) at 15% payload, vs cell Wh/kg (installed = x0.63) and f_non")
    es = (250, 300, 400, 500)
    print("f_non | " + " ".join(f"{e:>5d}" for e in es))
    for f in fn:
        print(f"{f:5.3f} | " + " ".join(f"{max_range(e, f):5.0f}" for e in es))
    print("\nB. Cell Wh/kg needed for 100, 200, 300 km")
    print("f_non | 100km 200km 300km")
    for f in fn:
        print(f"{f:5.3f} | " + " ".join(f"{need_energy(r, f):5d}" for r in (100, 200, 300)))


if __name__ == "__main__":
    main()
