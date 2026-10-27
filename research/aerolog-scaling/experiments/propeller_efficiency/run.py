"""H4: how far does peak propeller efficiency fall with blade Reynolds number?

Reads the UIUC Propeller Database (Brandt/Deters/Selig/Dantsker, wind-tunnel
measurements, https://m-selig.ae.illinois.edu/props/propDB.html). For every
APC propeller with a geometry file, each tested RPM gives one (J, CT, CP, eta)
curve; its peak eta and the blade Reynolds number at 0.75 R

    Re75 = rho * (0.75 * Omega * R) * (c/R)_75 * R / mu

are recorded. Under Froude scaling Re75 scales as n^1.5 (tip speed ~ n^0.5,
chord ~ n), so n = 0.1 is a factor 0.0316 in Re75.

Usage: python3 run.py [path to UIUC-propDB dir]   (downloads ~91 MB if absent)
"""
import math
import os
import sys
import urllib.request
import zipfile

import numpy as np

URL = "https://m-selig.ae.illinois.edu/props/download/UIUC-propDB.zip"
RHO, MU = 1.2, 1.8e-5  # lab air, ~20 C; Re75 scales linearly in both, so only the shift in log Re moves


def fetch(root):
    if os.path.isdir(os.path.join(root, "UIUC-propDB")):
        return os.path.join(root, "UIUC-propDB")
    os.makedirs(root, exist_ok=True)
    zp = os.path.join(root, "db.zip")
    urllib.request.urlretrieve(URL, zp)
    with zipfile.ZipFile(zp) as z:
        z.extractall(root)
    return os.path.join(root, "UIUC-propDB")


def read_table(path, ncol=4):
    rows = []
    for ln in open(path, errors="ignore").read().splitlines()[1:]:
        p = ln.split()
        if len(p) >= ncol:
            try:
                rows.append([float(x) for x in p[:ncol]])
            except ValueError:
                pass
    return np.array(rows)


def collect(db):
    out = []  # (family, prop, rpm, Re75, eta_max, J at eta_max, unused)
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
                dia_in = float(size.split("x")[0]); rpm = float(rpm)
            except ValueError:
                continue
            gp = os.path.join(d, f"{fam}_{size}_geom.txt")
            if not os.path.exists(gp):
                continue
            g = read_table(gp, 3)[:, :2]
            c75 = float(np.interp(0.75, g[:, 0], g[:, 1]))
            t = read_table(os.path.join(d, f))
            if len(t) < 6:
                continue
            R = dia_in * 0.0254 / 2
            om = rpm * 2 * math.pi / 60
            re75 = RHO * 0.75 * om * R * c75 * R / MU
            k = int(np.argmax(t[:, 3]))
            if t[k, 3] > 1.0 or k in (0, len(t) - 1):  # peak not bracketed or unphysical
                continue
            out.append((fam, f"{fam}_{size}", rpm, re75, t[k, 3], t[k, 0], None))
    return out


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "/tmp/uiuc"
    db = fetch(root)
    rows = collect(db)
    print(f"curves with a bracketed efficiency peak: {len(rows)}; propellers: {len({r[1] for r in rows})}")
    re = np.array([r[3] for r in rows]); eta = np.array([r[4] for r in rows])
    print(f"Re75 range {re.min():.3g} to {re.max():.3g}; 5th/95th pct {np.percentile(re,5):.3g} / {np.percentile(re,95):.3g}")

    # within-propeller slope: eta_max against log10 Re75, propeller fixed effects
    props = sorted({r[1] for r in rows})
    xs, ys, slopes, spans = [], [], [], []
    for p in props:
        sel = [r for r in rows if r[1] == p]
        x = np.log10([r[3] for r in sel]); y = np.array([r[4] for r in sel])
        if len(sel) >= 3 and x.max() - x.min() >= 0.2:
            b = np.polyfit(x, y, 1)[0]
            slopes.append(b); spans.append(x.max() - x.min())
            xs.extend(x - x.mean()); ys.extend(y - y.mean())
    xs, ys = np.array(xs), np.array(ys)
    pooled = float((xs @ ys) / (xs @ xs))
    rng = np.random.default_rng(0)
    idx = np.arange(len(slopes)); sl = np.array(slopes)
    boot = [np.mean(sl[rng.choice(idx, len(idx))]) for _ in range(5000)]
    lo, hi = np.percentile(boot, [2.5, 97.5])
    print(f"propellers with >=3 RPMs and >=0.2 decade of Re75: {len(slopes)}; median span {np.median(spans):.2f} decades")
    print(f"pooled within-propeller slope d(eta_max)/d(log10 Re75): {pooled:.3f}")
    print(f"mean of per-propeller slopes {sl.mean():.3f}, 95% bootstrap CI [{lo:.3f}, {hi:.3f}], share positive {np.mean(sl>0):.2f}")
    drop = 1.5 * np.array([sl.mean(), lo, hi])
    print(f"extrapolated eta_max drop for Re75 x 0.0316 (n = 0.1), in points: {100*drop[0]:.1f} [{100*drop[1]:.1f}, {100*drop[2]:.1f}]")

    # saturating forms: eta = eta_inf(prop) - a * Re75^-b, b fixed (0.5 laminar-like, 0.2 turbulent flat plate)
    for b in (0.5, 0.2):
        zs, ws, per = [], [], []
        for p in props:
            sel = [r for r in rows if r[1] == p]
            z = np.array([r[3] for r in sel]) ** -b; w = np.array([r[4] for r in sel])
            zs.extend(z - z.mean()); ws.extend(w - w.mean())
        zs, ws = np.array(zs), np.array(ws)
        a = float(-(zs @ ws) / (zs @ zs))
        bz = [np.array([r[3] for r in rows if r[1] == p]) ** -b for p in props]
        bw = [np.array([r[4] for r in rows if r[1] == p]) for p in props]
        boots = []
        for _ in range(2000):
            ch = rng.choice(len(props), len(props))
            Z = np.concatenate([bz[i] - bz[i].mean() for i in ch]); W = np.concatenate([bw[i] - bw[i].mean() for i in ch])
            boots.append(-(Z @ W) / (Z @ Z))
        alo, ahi = np.percentile(boots, [2.5, 97.5])
        f = lambda aa: 100 * aa * (3.2e4 ** -b - 1e6 ** -b)
        g = lambda aa: 100 * aa * (3.2e4 ** -b - 1e5 ** -b)
        print(f"saturating fit b={b}: a={a:.2f} [{alo:.2f},{ahi:.2f}]; eta drop 1e5 -> 3.2e4 (inside data) {g(a):.1f} pts [{g(alo):.1f},{g(ahi):.1f}]; "
              f"1e6 -> 3.2e4 (n=0.1 vs an assumed full-size Re75 1e6, outside data) {f(a):.1f} pts [{f(alo):.1f},{f(ahi):.1f}]")

    # direct, no extrapolation: high-Re vs low-Re curves of the SAME propeller
    big = []
    for p in props:
        sel = sorted([r for r in rows if r[1] == p], key=lambda r: r[3])
        if len(sel) >= 2 and sel[-1][3] / sel[0][3] >= 3:
            big.append((p, sel[-1][3] / sel[0][3], sel[-1][4] - sel[0][4]))
    if big:
        d = np.array([b[2] for b in big]); r_ = np.array([b[1] for b in big])
        print(f"same-propeller extremes with Re ratio >= 3: {len(big)} props; median ratio {np.median(r_):.1f}; "
              f"mean eta gain {100*d.mean():.1f} points (median {100*np.median(d):.1f}, max {100*d.max():.1f})")

    # by family
    for fam in sorted({r[0] for r in rows}):
        s = [r for r in rows if r[0] == fam]
        print(f"  {fam}: {len(s)} curves, Re75 {min(r[3] for r in s):.2g}..{max(r[3] for r in s):.2g}, eta_max mean {np.mean([r[4] for r in s]):.3f}")

    # pooled binned view
    print("binned eta_max (all APC curves):")
    for a, b in [(1e4, 2e4), (2e4, 4e4), (4e4, 8e4), (8e4, 1.6e5), (1.6e5, 3.2e5), (3.2e5, 1e6)]:
        m = (re >= a) & (re < b)
        if m.sum():
            print(f"  Re75 {a:.1e}..{b:.1e}: n={m.sum():4d}  mean {eta[m].mean():.3f}  sd {eta[m].std():.3f}")


if __name__ == "__main__":
    main()
