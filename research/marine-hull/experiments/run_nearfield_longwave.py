"""Milestone 7zu: the near field's long-wave residual (7zt) traced and removed, and the monohull's loss without a splice.

    PYTHONPATH=src:experiments python3 experiments/run_nearfield_longwave.py > experiments/results_nearfield_longwave.txt

7zt found the near-field added resistance (Boese 1970 in PDSTRIP's documented form, `marine_hull.nearfield`) 297 to
311 times GB at lambda/L 10 on the 4 m monohull, with the excess in the rotation term (PDSTRIP eq. 166). The plan in
LOG.md (committed before this code) shows the rotated-mean-pressure candidate is identically zero for heave and pitch,
and traces the residual to the strip motions' viscous damping force on the absolute heave velocity, which the pressure
force integrated in eq. 166 carries and the hull's rotation turns into a mean x-force: in long waves
(1/2) Re(i omega_e B_v z theta*) -> (1/2) omega_e B_v k |z|^2. Rows:

    GB      Gerritsma-Beukelman (the paper's formula)
    NF      PDSTRIP's three terms (7zs)                      NF0     the same without the U d/dx convection
    NF-P    rotation term with the total force M a (Pinkster 1980)   NF0-P   the same, unconvected
    NF-PG   NF-P plus the X . grad p term (Pinkster's, not in PDSTRIP's list)   NF0-PG

Sections: A pointwise long-wave sweep (monohull 1 m/s, Wigley I Fn 0.2; zeta 0 and 7zg) and the L0 / L1 checks;
B Journee's Wigley I and III peaks at Fn 0.2 to 0.4 (second-hand, as 7zk and 7zs) and Kashiwagi's tank-hull area;
C the monohull's 30 W loss (7zt's table, unspliced).
"""
import math
import sys
import time

from marine_hull import nearfield as nf
from marine_hull import reflection as rf
from marine_hull import strip as st
import run_a0_coupling_transfer as a0
import run_faltinsen_reflection as fr
import run_journee_lb10 as jl
import run_nearfield_monohull as nm
import run_nearfield_pdstrip as npd
import run_range_speed as rr
import run_wigley_seakeeping_tank as wt

G = st.G
Z3, Z5 = 0.0375, 0.0
ROWS = (("GB", "gb"), ("NF", "nf"), ("NF0", "nf0"), ("NF-P", "nf_p"), ("NF0-P", "nf0_p"),
        ("NF-PG", "nf_pg"), ("NF0-PG", "nf0_pg"))
SWEEP = (0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0, 16.0, 24.0, 32.0)
LONG = (8.0, 12.0, 16.0, 24.0, 32.0)
FNS = (0.2, 0.3, 0.4)
LAMS = [round(0.30 + 0.01 * i, 2) for i in range(271)]


def omega_of(lam, l):
    return math.sqrt(2.0 * math.pi * G / (lam * l))


def sweep(pr, n, h, u, label):
    """Section A for one hull and speed: returns {damping: {lam: response}}."""
    out = {}
    for dname, z3 in (("zeta 0", 0.0), ("7zg", Z3)):
        h.set_viscous(z3, Z5)
        rows = {lam: n.response(omega_of(lam, h.l), u) for lam in SWEEP}
        out[dname] = rows
        pr(f"# {label}, {dname}: lam/L " + " ".join(name for name, _ in ROWS) + "  wl vel rot rot_newton grad0")
        for lam, o in rows.items():
            pr(f"  {lam:5.2f} " + " ".join(f"{o[key]:.4g}" for _, key in ROWS)
               + f"  {o['wl']:.4g} {o['vel']:.4g} {o['rot']:.4g} {o['rot_newton']:.4g} {o['grad0']:.4g}")
    h.set_viscous(0.0, 0.0)
    return out


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    pr("Milestone 7zu: the near field's long-wave residual and the monohull's unspliced loss")
    pr("R_aw in N/m2 per unit amplitude^2 (monohull) or sigma = R / (rho g a^2 B^2 / L) (Wigley I)")

    # ------------------------------------------------------------------ A. long-wave sweep
    pr("## A. long-wave sweep")
    mono = a0.Mono()
    mh = st.WigleyStrip(mono.l, mono.b, mono.t, table=mono.table)
    nmh = nf.NearField(mh)
    sm = sweep(pr, nmh, mh, 1.0, "monohull 4 m, 1 m/s")
    hI = st.ModifiedWigleyStrip(jl.L, jl.B, jl.D, kyy=jl.KYY, rho=jl.RHO, alpha=1.0)
    nI = nf.NearField(hI)
    u2 = 0.2 * math.sqrt(G * jl.L)
    normj = jl.RHO * G * jl.B * jl.B / jl.L
    sI = sweep(pr, nI, hI, u2, "Wigley I, Fn 0.2 (N/m2)")

    pr("L0 viscous part of the rotation term, 7zg, at lambda/L 8 and 16:")
    l0 = True
    for label, rows, h in (("monohull", sm, mh), ("Wigley I", sI, hI)):
        h.set_viscous(Z3, Z5)
        bv = h.bv33
        h.set_viscous(0.0, 0.0)
        for lam in (8.0, 16.0):
            o = rows["7zg"][lam]
            exact = 0.5 * (1j * o["we"] * bv * o["z"] * o["theta"].conjugate()).real
            k = omega_of(lam, h.l) ** 2 / G
            asym = 0.5 * o["we"] * bv * k * abs(o["z"]) ** 2
            d_b = o["rot_boese"] - o["rot_newton"]
            d_p = o["rot"] - o["rot_newton"]
            ok_b = abs(d_b - exact) <= 1e-9 * abs(exact)
            ok_p = abs(d_p - exact) <= 1e-9 * abs(exact)
            ok_a = abs(exact / asym - 1.0) <= 0.10
            l0 &= ok_p and ok_a
            pr(f"  {label} {lam:g}: (1/2)Re(i we Bv z th*) {exact:.4g}; rot_boese - rot_newton {d_b:.4g} "
               f"(to 1e-9: {ok_b}); rot (pressure) - rot_newton {d_p:.4g} (to 1e-9: {ok_p}); "
               f"(1/2) we Bv k |z|^2 {asym:.4g} (ratio {exact / asym:.3f}, within 10%: {ok_a})")
    pr(f"L0 as written (pressure rot - rot_newton to 1e-9 and the asymptote within 10%): {'held' if l0 else 'refuted'}")

    pr("L1 with 7zg, NF-P and NF0-P at lambda/L 8 to 32 against zeta 0 (within 25%) and their own peak (under 1%):")
    l1 = True
    for label, rows in (("monohull", sm), ("Wigley I", sI)):
        for key in ("nf_p", "nf0_p", "nf", "nf0", "nf_pg", "nf0_pg"):
            pk = max(o[key] for o in rows["7zg"].values())
            r_z = [rows["7zg"][lam][key] / rows["zeta 0"][lam][key] for lam in LONG]
            r_p = [abs(rows["7zg"][lam][key]) / pk for lam in LONG]
            ok = all(abs(x - 1.0) <= 0.25 for x in r_z) and all(x < 0.01 for x in r_p)
            if key in ("nf_p", "nf0_p"):
                l1 &= ok
            pr(f"  {label} {key:>6}: 7zg / zeta 0 " + " ".join(f"{x:.3f}" for x in r_z)
               + "; |.| / peak " + " ".join(f"{x:.2e}" for x in r_p) + f" -> {ok}")
    pr(f"L1 (NF-P, NF0-P on both hulls): {'held' if l1 else 'refuted'}")
    pr("ratio to GB at lambda/L 4, 8, 16, 32 (7zg):")
    for label, rows in (("monohull", sm), ("Wigley I", sI)):
        for name, key in ROWS[1:]:
            pr(f"  {label} {name:>6}: " + " ".join(f"{rows['7zg'][lam][key] / rows['7zg'][lam]['gb']:.3g}"
                                                  for lam in (4.0, 8.0, 16.0, 32.0)))
    pr(f"(section A {time.time() - t0:.0f} s)")
    out.flush()

    # ------------------------------------------------------------------ B. Journee and the tank hull
    pr("## B. Journee (1992) Wigley I and III, 7zg damping, peaks over the measured (second-hand, 7zk)")
    integral = rf.waterline_integral(rf.modified_wigley_slope(jl.L, jl.B), jl.L)
    res = {}
    for name, alpha in jl.HULLS:
        h = hI if alpha == 1.0 else st.ModifiedWigleyStrip(jl.L, jl.B, jl.D, kyy=jl.KYY, rho=jl.RHO, alpha=alpha)
        n = nI if alpha == 1.0 else nf.NearField(h)
        h.set_viscous(Z3, Z5)
        for fn in FNS:
            rows = npd.curve(n, jl.L, fn * math.sqrt(G * jl.L), normj, LAMS, integral, jl.D, jl.RHO)
            meas = jl.MEASURED[(name, fn)]
            line = []
            for cname, key in ROWS:
                f = (lambda r, key=key: r[key] + r["falt"]) if key == "gb" else (lambda r, key=key: r[key])
                v, lam, _ = npd.peak(rows, f)
                res[(name, fn, cname)] = v / meas
                line.append(f"{cname} {v:.2f}@{lam:.2f} ({v / meas:.3f})")
            pr(f"{name:>3} Fn {fn}: measured {meas:.1f}; " + "; ".join(line) + "  (GB with Faltinsen reflection)")
            out.flush()
        h.set_viscous(0.0, 0.0)
    pr("rms and mean of ln(peak / measured) over Journee's five clean peaks (I at Fn 0.4 noisy at source):")
    rms = {}
    for cname, _ in ROWS:
        ls = [math.log(res[(nmh_, fn, cname)]) for nmh_ in ("I", "III") for fn in FNS if (nmh_, fn) != ("I", 0.4)]
        rms[cname] = math.sqrt(sum(v * v for v in ls) / len(ls))
        pr(f"  {cname:>6}: rms {rms[cname]:.3f}, mean {sum(ls) / len(ls):+.3f}")
    d02 = {nmh_: res[(nmh_, 0.2, "NF-P")] / res[(nmh_, 0.2, "NF")] - 1.0 for nmh_ in ("I", "III")}
    l3 = rms["NF0-P"] <= 0.18 and all(abs(v) <= 0.05 for v in d02.values())
    pr(f"L3 NF0-P rms {rms['NF0-P']:.3f} (<= 0.18); NF-P / NF at Fn 0.2: I {100 * d02['I']:+.1f}%, "
       f"III {100 * d02['III']:+.1f}% (within 5%) -> {'held' if l3 else 'refuted'}")
    g02 = {(nmh_, a, b): res[(nmh_, 0.2, b)] / res[(nmh_, 0.2, a)] - 1.0
           for nmh_ in ("I", "III") for a, b in (("NF-P", "NF-PG"), ("NF0-P", "NF0-PG"))}
    pr("X . grad p at the Fn 0.2 peak: " + "; ".join(f"{k[0]} {k[2]} vs {k[1]} {100 * v:+.1f}%" for k, v in g02.items()))

    pr("## B2. Kashiwagi (2022) tank hull, Fn 0.2, 7zg damping, area on lambda/L 0.3-2.0 over the measured mean")
    data = wt.read_data()
    mean = wt.by_lambda([p for s in wt.SERIES for p in data[s]])
    xs = [x for x, _ in mean]
    am = wt.trap(mean)
    hT = st.ModifiedWigleyStrip(2.0, 0.3, 0.125, kyy=0.248, rho=1000.0)
    nT = nf.NearField(hT)
    hT.set_viscous(Z3, Z5)
    intT = rf.waterline_integral(rf.modified_wigley_slope(wt.L, wt.B), wt.L)
    rows = npd.curve(nT, wt.L, wt.FN * math.sqrt(G * wt.L), wt.RHO * G * wt.B * wt.B / wt.L, xs, intT, wt.D, wt.RHO)
    pr("  " + ", ".join(f"{name} {npd.trap(xs, [r[key] + (r['falt'] if key == 'gb' else 0.0) for r in rows]) / am:.3f}"
                        for name, key in ROWS) + "  (GB with Faltinsen reflection)")
    pr(f"(sections A-B {time.time() - t0:.0f} s)")
    out.flush()

    # ------------------------------------------------------------------ C. the monohull's 30 W loss
    pr("## C. the 4 m monohull's 30 W loss, 7zh pooled bow-sector climate, Faltinsen reflection added, unspliced")
    i_mono = rf.waterline_integral(rf.wigley_slope(mono.l, mono.b), mono.l)
    mh.set_viscous(Z3, Z5)
    cache = nm.Cached(nmh)
    pr("# table: formula pooled_1ms_motion_N loss30W_share025 loss30W_share1 scope200W")
    loss = {}
    for name, key in ROWS:
        tab = fr.FaltinsenWaveTable(nm.Formula(mh, cache, key), rr.DISP, mono.t01s, i_mono)
        e = fr.mono_eval(mono, tab)
        loss[name] = e
        pr(f"row {name} {e['motion']:.3f} {e['loss25']:.2f} {e['loss1']:.2f} {e['scope']}")
        out.flush()
    L = lambda n: -loss[n]["loss25"]
    pr(f"check: GB {L('GB'):.2f}% (7zr V0 {nm.REF_7ZR_V0}%); NF {L('NF'):.2f}% and NF0 {L('NF0'):.2f}% (7zt 8.69%, 6.68%)")
    l2 = 3.5 <= L("NF0-P") <= 4.5 and 4.8 <= L("NF-P") <= 6.4 and all(e["scope"] for e in loss.values())
    pr(f"L2 NF0-P {L('NF0-P'):.2f}% (3.5-4.5), NF-P {L('NF-P'):.2f}% (4.8-6.4), 200 W scope in every row "
       f"{all(e['scope'] for e in loss.values())} -> {'held' if l2 else 'refuted'}")
    dg = (L("NF-PG") - L("NF-P"), L("NF0-PG") - L("NF0-P"))
    gb_ok = all(abs(v) < 0.3 for v in dg) and all(abs(res[k[0], 0.2, k[2]] / res[k[0], 0.2, k[1]] - 1) <= 0.10
                                                  for k in g02)
    pr(f"L4 X . grad p moves the loss by {dg[0]:+.2f} (NF-P) and {dg[1]:+.2f} (NF0-P) points (< 0.3) and no Fn 0.2 "
       f"peak by more than 10% -> {'held' if gb_ok else 'refuted'}")
    pr(f"(elapsed {time.time() - t0:.0f} s, {len(cache.memo)} near-field evaluations)")


if __name__ == "__main__":
    main()
