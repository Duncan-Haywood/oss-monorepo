"""Milestone 5e: thrust-speed slope at constant motor power, from measured propeller CT, CP.

    python3 experiments/propeller_power_slope/run.py [dir holding UIUC-propDB] > experiments/propeller_power_slope/results.txt

5d assumed eta constant, so T = P eta / V gives s = -1. With a real propeller at constant shaft
power P, rpm n adjusts so that CP(J) rho n^3 D^5 = P. Then
    dln n   = -(q/3) dlnJ,           q = dlnCP/dlnJ
    dlnV    = (1 - q/3) dlnJ
    T V     = P eta(J)  ->  s_P = dlnT/dlnV = -1 + (dln eta/dlnJ) / (1 - q/3)
At the peak of eta, dln eta/dlnJ = 0, so s_P = -1 exactly; away from it, s_P moves. We read
CT, CP from each UIUC (APC) curve, fit quadratics in J over a 5-point window around the point
that sits at J = k * J_peak, and report s_P for k in 0.8..1.2. The question: how far off the
efficiency peak can the cruise point sit before 5d's s = -1 stops being a fair stand-in?
"""
import os, sys, math
import numpy as np
import importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
_sp = importlib.util.spec_from_file_location("pe", os.path.join(HERE, "..", "propeller_efficiency", "run.py"))
pe = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(pe)

KS = (0.8, 0.9, 1.0, 1.1, 1.2)


def curve_slopes(t):
    """t columns: J, CT, CP, eta. Returns {k: s_P} or None."""
    k0 = int(np.argmax(t[:, 3]))
    if t[k0, 3] > 1.0 or k0 < 2 or k0 > len(t) - 3:
        return None
    J, CT, CP = t[:, 0], t[:, 1], t[:, 2]
    if (CP <= 0).any() or (CT <= 0).any():
        return None
    # polynomial fits of ln CT, ln CP, ln eta against ln J over the whole usable range
    ok = CT > 0.01
    if ok.sum() < 7:
        return None
    x = np.log(J[ok])
    fe = np.polyfit(x, np.log(t[ok, 3]), 3)
    fp = np.polyfit(x, np.log(CP[ok]), 3)
    out = {}
    jpk = J[k0]
    for k in KS:
        xj = math.log(k * jpk)
        if xj < x.min() or xj > x.max():
            return None
        de = np.polyval(np.polyder(fe), xj)
        q = np.polyval(np.polyder(fp), xj)
        out[k] = -1 + de / (1 - q / 3)
    return out


def collect(db):
    rows = []
    for vol in sorted(os.listdir(db)):
        d = os.path.join(db, vol, "data")
        if not (vol.startswith("volume") and os.path.isdir(d)):
            continue
        for f in sorted(os.listdir(d)):
            if not f.startswith("apc") or f.endswith("_geom.txt") or "static" in f:
                continue
            parts = f[:-4].split("_")
            if len(parts) != 4 or "x" not in parts[1]:
                continue
            try:
                float(parts[3])
            except ValueError:
                continue
            t = pe.read_table(os.path.join(d, f))
            if len(t) < 7:
                continue
            r = curve_slopes(t)
            if r:
                rows.append((f"{parts[0]}_{parts[1]}", r))
    return rows


def main():
    db = pe.fetch(sys.argv[1] if len(sys.argv) > 1 else "/tmp/uiuc")
    rows = collect(db)
    print(f"curves {len(rows)}; propellers {len({r[0] for r in rows})}")
    print("s_P = dlnT/dlnV at constant shaft power, with J = k * J_peak-efficiency")
    print(f"  {'k':>4} {'median':>7} {'5th':>7} {'95th':>7} {'share within 0.25 of -1':>24}")
    for k in KS:
        v = np.array([r[1][k] for r in rows])
        print(f"  {k:4.1f} {np.median(v):7.2f} {np.percentile(v,5):7.2f} {np.percentile(v,95):7.2f} {np.mean(abs(v+1)<0.25):24.2f}")
    v = np.array([r[1][1.0] for r in rows])
    print(f"check: at the peak (k = 1) s_P should be -1 up to the cubic-fit error; max |s_P+1| = {abs(v+1).max():.3f}")


if __name__ == "__main__":
    main()
