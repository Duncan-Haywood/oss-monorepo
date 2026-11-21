"""Milestone 7zs: near-field added resistance (Boese 1970, in PDSTRIP's documented form) against Gerritsma-Beukelman.

    PYTHONPATH=src:experiments python3 experiments/run_nearfield_pdstrip.py > experiments/results_nearfield_pdstrip.txt

Formula: PDSTRIP theory manual (Soeding, Bertram, Thiart; github.com/eriove/pdstrip, MIT, `doc/pdstrip_documentation.ps`,
ch. 17, eqs. 166, 170, 175), implemented in `marine_hull.nearfield` on this code's own Frank sections and with the
motions of `strip.WigleyStrip.response` unchanged, so only the added-resistance formula differs from the GB rows.

Sections: A code checks; B zero speed against Maruo's 3D far field (7zm, Capytaine, read from
results_maruo_check.txt); C Journee's (1992) Wigley I and III at Fn 0.2, 0.3, 0.4 (peaks second-hand, as 7zk);
D Kashiwagi's (2022) tank hull at Fn 0.2 against the measured Fig. 3 points. Expectations N1 to N6 and checks N0a to
N0c were committed to LOG.md before this code (f7712094e). N0d (the integrated pressure force against Newton) was
added while writing the code, after a smoke run, and is labelled so.
"""
import math
import os
import re
import sys
import time

from marine_hull import nearfield as nf
from marine_hull import reflection as rf
from marine_hull import strip as st
import run_journee_lb10 as jl
import run_wigley_seakeeping_tank as wt

HERE = os.path.dirname(os.path.abspath(__file__))
G = st.G
FNS = (0.2, 0.3, 0.4)
LAMS = [round(0.30 + 0.01 * i, 2) for i in range(271)]
DAMP = (("zeta 0", 0.0, 0.0), ("7zg", 0.0375, 0.0))
GB_UNDAMPED_RATIO = {"I": 0.753, "III": 0.807}          # 7zk, strip GB + Faltinsen at zeta 0, Fn 0.2
MARUO = os.path.join(HERE, "results_maruo_check.txt")


def maruo_free():
    """7zm's fine-mesh rows: {hull key: {lam: (Maruo free, GB strip)}}."""
    out, key, fine = {}, None, False
    with open(MARUO) as f:
        for line in f:
            m = re.match(r"-- (\w) \(.*fine mesh", line)
            if m:
                key, fine = m.group(1), True
                out[key] = {}
                continue
            if line.startswith("-- "):
                fine = False
            if fine and re.match(r"\s+\d\.\d\d\s", line):
                v = line.split()
                out[key][float(v[0])] = (float(v[5]), float(v[6]))
    return out


def trap(xs, ys):
    return sum(0.5 * (ys[i] + ys[i + 1]) * (xs[i + 1] - xs[i]) for i in range(len(xs) - 1))


def curve(n, l, u, norm, lams, integral=None, draft=None, rho=None):
    rows = []
    for x in lams:
        w = math.sqrt(2.0 * math.pi / (x * l) * G)
        o = n.response(w, u)
        o = {k: (v / norm if isinstance(v, float) else v) for k, v in o.items()}
        o["lam"] = x
        o["falt"] = rf.rao(w, u, integral, draft, rho=rho) / norm if integral is not None else 0.0
        rows.append(o)
    return rows


def peak(rows, f):
    best = max(rows, key=f)
    return f(best), best["lam"], best


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    pr("Milestone 7zs: near-field (Boese 1970 / PDSTRIP ch. 17) against Gerritsma-Beukelman, same sections and motions")
    pr("terms (R = -f_x, sigma units): wl waterline (175), vel squared velocity (170), rot pressure force x rotation "
       "(166, force summed from the pressures as PDSTRIP); nf = wl + vel + rot; nf_b with Boese's m*a force in 166; "
       "nf0 without U d/dx in the pressure and velocity")

    # ------------------------------------------------------------------ A. code checks
    pr("## A. code checks")
    hI = st.ModifiedWigleyStrip(jl.L, jl.B, jl.D, kyy=jl.KYY, rho=jl.RHO, alpha=1.0)
    nI = nf.NearField(hI)
    worst = 0.0
    for r in nI.field.ratios:
        if nI.field.geo[r] is None:
            continue
        for k in range(len(nI.field.nu_t)):
            a_tab = hI.table.a[r][k]
            worst = max(worst, abs(nI.field.a_star(r, k) - a_tab) / max(abs(a_tab), 1e-12))
    pr(f"N0a panel-potential a33 against the a33 table, every tabulated point, Wigley I: max relative difference "
       f"{worst:.2e} -> {'held' if worst < 1e-9 else 'refuted'} (1e-9)")
    pr(f"field table: {len(nI.field.ratios)} sections x {len(nI.field.nu_t)} nu T, {nI.field.n_irregular} points near "
       f"irregular frequencies patched ({time.time() - t0:.0f} s)")
    u2 = 0.2 * math.sqrt(G * jl.L)
    normj = jl.RHO * G * jl.B * jl.B / jl.L
    cI = curve(nI, jl.L, u2, normj, LAMS)
    p16 = peak(cI, lambda r: r["nf"])
    h24 = st.ModifiedWigleyStrip(jl.L, jl.B, jl.D, kyy=jl.KYY, rho=jl.RHO, alpha=1.0, n_panels=24)
    n24 = nf.NearField(h24, n_panels=24)
    c24 = curve(n24, jl.L, u2, normj, LAMS)
    p24 = peak(c24, lambda r: r["nf"])
    dpk = abs(p24[0] / p16[0] - 1.0)
    pr(f"N0b Wigley I Fn 0.2 zeta 0 NF peak: 16 panels {p16[0]:.3f} at {p16[1]:.2f}, 24 panels {p24[0]:.3f} at "
       f"{p24[1]:.2f}; change {100 * dpk:.2f}% -> {'held' if dpk < 0.05 else 'refuted'} (5%)")
    tail = cI[-1]["nf"] / p16[0]
    pr(f"N0c Wigley I Fn 0.2 zeta 0 NF at lambda/L 3.0 over its peak: {tail:.4f} -> "
       f"{'held' if abs(tail) < 0.10 else 'refuted'} (0.10)")
    pr("N0d (added after a smoke run, not in the plan): |F3 summed from the pressures - Newton m a| / |m a|, Wigley I, "
       "zeta 0, median over lambda/L 0.9-2.0 (with / without U d/dx in the pressure)")
    for fn in (0.0, 0.2, 0.3):
        rows = cI if fn == 0.2 else curve(nI, jl.L, fn * math.sqrt(G * jl.L), normj, LAMS)
        sel = [r for r in rows if 0.9 - 1e-9 <= r["lam"] <= 2.0 + 1e-9]
        a = sorted(abs(r["f3"] - r["f3_newton"]) / abs(r["f3_newton"]) for r in sel)
        b = sorted(abs(r["f30"] - r["f3_newton"]) / abs(r["f3_newton"]) for r in sel)
        pr(f"  Fn {fn}: {a[len(a) // 2]:.3f} / {b[len(b) // 2]:.3f}")

    # ------------------------------------------------------------------ B. zero speed against Maruo
    pr("## B. zero speed, zeta 0: NF on the strip sections against Maruo's 3D far field (7zm, panel motions)")
    mar = maruo_free()
    hulls_b = {"T": st.ModifiedWigleyStrip(2.0, 0.3, 0.125, kyy=0.248, rho=1000.0),
               "M": st.WigleyStrip(4.0, 0.4, 0.274390243902439, kyy=0.25, rho=1025.0)}
    n1, nfs = {}, {}
    for key, h in hulls_b.items():
        n = nfs[key] = nf.NearField(h)
        norm = h.rho * G * h.bm * h.bm / h.l
        lams = sorted(mar[key])
        rows = curve(n, h.l, 0.0, norm, lams)
        pr(f"# {key}: lam/L  Maruo free  GB strip (7zm)  GB here  NF  wl  vel  rot  NF/Maruo")
        for r in rows:
            mf, g7 = mar[key][r["lam"]]
            pr(f"  {r['lam']:.2f} {mf:9.4f} {g7:9.4f} {r['gb']:9.4f} {r['nf']:9.4f} {r['wl']:8.4f} {r['vel']:8.4f} "
               f"{r['rot']:8.4f} {r['nf'] / mf:7.3f}")
        band = [r for r in rows if 0.5 - 1e-9 <= r["lam"] <= 2.0 + 1e-9]
        xs = [r["lam"] for r in band]
        am = trap(xs, [mar[key][x][0] for x in xs])
        ag = trap(xs, [r["gb"] for r in band])
        an = trap(xs, [r["nf"] for r in band])
        n1[key] = an / am
        pr(f"{key} areas on 0.5-2.0: Maruo free {am:.4f}, GB {ag:.4f} (7zm's {trap(xs, [mar[key][x][1] for x in xs]):.4f}), "
           f"NF {an:.4f}; GB/Maruo {ag / am:.3f}, NF/Maruo {an / am:.3f}")
    ok1 = all(0.6 <= v <= 1.8 for v in n1.values())
    pr(f"N1 NF / Maruo free on 0.5-2.0: T {n1['T']:.3f}, M {n1['M']:.3f} -> {'held' if ok1 else 'refuted'} (0.6-1.8)")

    # ------------------------------------------------------------------ C. Journee's L/B 10 hulls
    pr("## C. Journee (1992) Wigley I and III, peaks over the measured (second-hand, 7zk)")
    integral = rf.waterline_integral(rf.modified_wigley_slope(jl.L, jl.B), jl.L)
    res = {}
    for name, alpha in jl.HULLS:
        h = hI if alpha == 1.0 else st.ModifiedWigleyStrip(jl.L, jl.B, jl.D, kyy=jl.KYY, rho=jl.RHO, alpha=alpha)
        n = nI if alpha == 1.0 else nf.NearField(h)
        for dname, z3, z5 in DAMP:
            h.set_viscous(z3, z5)
            for fn in FNS:
                u = fn * math.sqrt(G * jl.L)
                rows = curve(n, jl.L, u, normj, LAMS, integral, jl.D, jl.RHO)
                meas = jl.MEASURED[(name, fn)]
                cols = (("GB", lambda r: r["gb"]), ("GB+F", lambda r: r["gb"] + r["falt"]),
                        ("NF", lambda r: r["nf"]), ("NF+F", lambda r: r["nf"] + r["falt"]),
                        ("NF_b", lambda r: r["nf_boese"]), ("NF0", lambda r: r["nf0"]))
                line = []
                for cname, f in cols:
                    v, lam, best = peak(rows, f)
                    res[(name, dname, fn, cname)] = (v, lam, best)
                    line.append(f"{cname} {v:6.2f} @{lam:.2f} ({v / meas:.3f})")
                pr(f"{name:>3} {dname:>6} Fn {fn}: measured {meas:5.1f}; " + "; ".join(line))
                v, lam, best = res[(name, dname, fn, "NF")]
                pr(f"      NF terms at its peak: wl {best['wl']:.2f}, vel {best['vel']:.2f}, rot {best['rot']:.2f}; "
                   f"|z| {abs(best['z']):.3f}")
            h.set_viscous(0.0, 0.0)
    rat = lambda nm, d, fn, c: res[(nm, d, fn, c)][0] / jl.MEASURED[(nm, fn)]
    gb0 = {nm: rat(nm, "zeta 0", 0.2, "GB+F") for nm in ("I", "III")}
    nf0r = {nm: rat(nm, "zeta 0", 0.2, "NF") for nm in ("I", "III")}
    pr(f"check: GB+F at zeta 0, Fn 0.2 reproduces 7zk's undamped ratios: I {gb0['I']:.3f} (7zk 0.753), "
       f"III {gb0['III']:.3f} (7zk 0.807)")
    ok2 = all(nf0r[nm] < gb0[nm] for nm in nf0r)
    pr(f"N2 Fn 0.2 zeta 0 NF / measured: I {nf0r['I']:.3f}, III {nf0r['III']:.3f}; below GB+F's -> "
       f"{'held' if ok2 else 'refuted'}")
    in_band = {nm: 0.85 <= nf0r[nm] <= 1.15 for nm in nf0r}
    pr(f"   (both in 0.85-1.15: {all(in_band.values())}; 7zg damping NF: I {rat('I', '7zg', 0.2, 'NF'):.3f}, "
       f"III {rat('III', '7zg', 0.2, 'NF'):.3f})")
    ok3 = all(rat(nm, "zeta 0", 0.2, "NF") < rat(nm, "zeta 0", 0.3, "NF") < rat(nm, "zeta 0", 0.4, "NF")
              for nm in ("I", "III"))
    pr("N3 NF peak ratio rises with Fn (zeta 0): " + "; ".join(
        f"{nm} " + ", ".join(f"{rat(nm, 'zeta 0', fn, 'NF'):.3f}" for fn in FNS) for nm in ("I", "III"))
       + f" -> {'held' if ok3 else 'refuted'}")
    ok5 = True
    for nm in ("I", "III"):
        b = res[(nm, "zeta 0", 0.2, "NF")][2]
        ok5 &= b["wl"] >= max(b["vel"], b["rot"])
    pr(f"N5 the waterline term is the largest at the Fn 0.2 NF peak on both hulls -> {'held' if ok5 else 'refuted'}")
    ch = {nm: res[(nm, "zeta 0", 0.2, "NF0")][0] / res[(nm, "zeta 0", 0.2, "NF")][0] - 1.0 for nm in ("I", "III")}
    ok6 = all(abs(v) > 0.10 for v in ch.values())
    pr(f"N6 dropping U d/dx moves the Fn 0.2 NF peak: I {100 * ch['I']:+.1f}%, III {100 * ch['III']:+.1f}% -> "
       f"{'held' if ok6 else 'refuted'} (> 10%)")
    pr("Fn trend, rms of ln(peak / measured) over Journee's five clean peaks (I at Fn 0.4 noisy at source):")
    for d in ("zeta 0", "7zg"):
        for c in ("GB+F", "NF", "NF+F", "NF_b", "NF0"):
            ls = [math.log(rat(nm, d, fn, c)) for nm in ("I", "III") for fn in FNS if (nm, fn) != ("I", 0.4)]
            pr(f"  {d:>6} {c:>5}: rms {math.sqrt(sum(v * v for v in ls) / len(ls)):.3f}, mean {sum(ls) / len(ls):+.3f}")

    # ------------------------------------------------------------------ D. Kashiwagi's tank hull at Fn 0.2
    pr("## D. Kashiwagi (2022) tank hull, Fn 0.2, against the measured Fig. 3 mean (lambda/L 0.3-2.0)")
    data = wt.read_data()
    mean = wt.by_lambda([p for s in wt.SERIES for p in data[s]])
    xs = [x for x, _ in mean]
    am = wt.trap(mean)
    hT = hulls_b["T"]
    nT = nfs["T"]
    intT = rf.waterline_integral(rf.modified_wigley_slope(wt.L, wt.B), wt.L)
    normT = wt.RHO * G * wt.B * wt.B / wt.L
    uT = wt.FN * math.sqrt(G * wt.L)
    n4 = None
    for dname, z3, z5 in DAMP:
        hT.set_viscous(z3, z5)
        rows = curve(nT, wt.L, uT, normT, xs, intT, wt.D, wt.RHO)
        pr(f"# {dname}: lam/L measured  GB  GB+F  NF  NF+F  NF0")
        for (x, v), r in zip(mean, rows):
            pr(f"  {x:.2f} {v:7.3f} {r['gb']:7.3f} {r['gb'] + r['falt']:7.3f} {r['nf']:7.3f} {r['nf'] + r['falt']:7.3f} "
               f"{r['nf0']:7.3f}")
        ar = {c: trap(xs, [f(r) for r in rows]) / am for c, f in (
            ("GB", lambda r: r["gb"]), ("GB+F", lambda r: r["gb"] + r["falt"]), ("NF", lambda r: r["nf"]),
            ("NF+F", lambda r: r["nf"] + r["falt"]), ("NF0", lambda r: r["nf0"]))}
        rms = {c: math.sqrt(sum((f(r) - v) ** 2 for (x, v), r in zip(mean, rows)) / len(rows)) for c, f in (
            ("GB+F", lambda r: r["gb"] + r["falt"]), ("NF", lambda r: r["nf"]), ("NF+F", lambda r: r["nf"] + r["falt"]))}
        pr(f"{dname}: area over measured {am:.3f}: " + ", ".join(f"{c} {v:.3f}" for c, v in ar.items())
           + "; rms error " + ", ".join(f"{c} {v:.2f}" for c, v in rms.items()))
        if dname == "7zg":
            n4 = ar["NF"]
    hT.set_viscous(0.0, 0.0)
    pr(f"N4 tank hull Fn 0.2, 7zg damping, NF area / measured {n4:.3f} -> {'held' if 0.6 <= n4 <= 1.2 else 'refuted'} "
       f"(0.6-1.2)")
    pr(f"time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
