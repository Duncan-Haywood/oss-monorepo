"""Milestone 5b: does the propeller's thrust-speed slope depend on Reynolds number?

At fixed RPM, T = CT(J) rho n^2 D^4 and J = V/(nD), so dlnT/dlnV = dlnCT/dlnJ =: s.
s is the dimensionless "thrust law" the longitudinal model lacks (3a, no thrust
term). Froude scaling keeps J and the flight condition fixed, so the model's
phugoid damping from thrust changes only if s changes with the blade Reynolds
number. s is read at the J of peak efficiency (cruise) from the UIUC Propeller
Database (APC, wind tunnel), by a local quadratic fit of CT(J) over 5 points.

Usage: python3 run.py [dir holding UIUC-propDB, default /tmp/uiuc]
"""
import os, sys, math
import numpy as np
import importlib.util
_sp = importlib.util.spec_from_file_location("pe", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "propeller_efficiency", "run.py"))
pe = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(pe)  # fetch, read_table, RHO, MU

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
            fam, size, _, rpm = parts
            try:
                dia = float(size.split("x")[0]); rpm = float(rpm)
            except ValueError:
                continue
            gp = os.path.join(d, f"{fam}_{size}_geom.txt")
            if not os.path.exists(gp):
                continue
            g = pe.read_table(gp, 3)[:, :2]
            c75 = float(np.interp(0.75, g[:, 0], g[:, 1]))
            t = pe.read_table(os.path.join(d, f))
            if len(t) < 7:
                continue
            k = int(np.argmax(t[:, 3]))
            if t[k, 3] > 1.0 or k < 2 or k > len(t) - 3:
                continue
            J, CT = t[k - 2:k + 3, 0], t[k - 2:k + 3, 1]
            if CT.min() <= 0:
                continue
            c = np.polyfit(J - J[2], CT, 2)  # CT ~ c0 (J-J0)^2 + c1 (J-J0) + c2
            s = t[k, 0] * c[1] / c[2]       # dlnCT/dlnJ at the fitted peak J (J - J0 = 0 point)
            R = dia * 0.0254 / 2; om = rpm * 2 * math.pi / 60
            re75 = pe.RHO * 0.75 * om * R * c75 * R / pe.MU
            rows.append((f"{fam}_{size}", rpm, re75, t[k, 0], t[k, 3], s))
    return rows

def main():
    db = pe.fetch(sys.argv[1] if len(sys.argv) > 1 else "/tmp/uiuc")
    rows = collect(db)
    props = sorted({r[0] for r in rows})
    s = np.array([r[5] for r in rows]); re = np.array([r[2] for r in rows])
    print(f"curves {len(rows)}; propellers {len(props)}; Re75 {re.min():.3g} to {re.max():.3g}")
    print(f"s = dlnCT/dlnJ at peak-eta J: median {np.median(s):.2f}, 5th/95th pct {np.percentile(s,5):.2f} / {np.percentile(s,95):.2f}")
    sl, span = [], []
    for p in props:
        sel = [r for r in rows if r[0] == p]
        x = np.log10([r[2] for r in sel]); y = np.array([r[5] for r in sel])
        if len(sel) >= 3 and x.max() - x.min() >= 0.2:
            sl.append(np.polyfit(x, y, 1)[0]); span.append(x.max() - x.min())
    sl = np.array(sl); rng = np.random.default_rng(0)
    boot = [rng.choice(sl, len(sl)).mean() for _ in range(5000)]
    lo, hi = np.percentile(boot, [2.5, 97.5])
    print(f"within-propeller d s / d log10 Re75: mean {sl.mean():.3f} [{lo:.3f}, {hi:.3f}] over {len(sl)} propellers, share positive {np.mean(sl>0):.2f}")
    print(f"implied change in s for Re75 x 0.0316 (1.5 decades): {-1.5*sl.mean():.2f} [{-1.5*hi:.2f}, {-1.5*lo:.2f}]  (extrapolation)")
    jpk = np.array([r[3] for r in rows])
    sj = [np.polyfit(np.log10(re[[i for i,r in enumerate(rows) if r[0]==p]]), jpk[[i for i,r in enumerate(rows) if r[0]==p]], 1)[0]
          for p in props if sum(r[0]==p for r in rows) >= 3]
    print(f"within-propeller d J_peak / d log10 Re75: mean {np.mean(sj):.4f} (J at peak efficiency itself moves with Re)")
    print("binned s (all curves):")
    for a, b in [(1e4, 2e4), (2e4, 4e4), (4e4, 8e4), (8e4, 1.6e5)]:
        m = (re >= a) & (re < b)
        if m.sum():
            print(f"  Re75 {a:.0e}..{b:.0e}: n={m.sum():4d} mean s {s[m].mean():.2f} sd {s[m].std():.2f}")

if __name__ == "__main__":
    main()
