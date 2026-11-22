"""Milestone 7zw: viscous heave damping on the relative vertical velocity instead of the absolute heave velocity.

    PYTHONPATH=src:experiments python3 experiments/run_relative_damping.py > experiments/results_relative_damping.txt

7zu traced the near field's long-wave residual to the strip motions' viscous force -B_v dz/dt: PDSTRIP's rotation term
(166) integrates the pressure force, M a + B_v dz/dt, and pitch tilts that into a mean x-force. 7zu removed it from the
drift force (Pinkster's rotation of M a). This step moves the viscous force onto the strip's own relative vertical
velocity (`strip.WigleyStrip.relative_damping`), which goes to zero as the hull follows a long wave, and asks what that
does to PDSTRIP's own form, the motion fit (7zg), Journee's peaks and the monohull's 30 W loss. Plan and expectations
W0 to W5: LOG.md, milestone 7zw, committed before this code.

Sections: B the motion refit (run first, the other sections use it); A the long-wave sweep; C Journee and the tank
hull; D the monohull's 30 W loss.
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
import run_motion_damping_holdout as mdh
import run_nearfield_monohull as nm
import run_nearfield_pdstrip as npd
import run_range_speed as rr
import run_wigley_seakeeping_tank as wt

G = st.G
Z3 = 0.0375                               # 7zg's motion fit (absolute damping), pitch 0
ROWS = (("GB", "gb"), ("NF", "nf"), ("NF-P", "nf_p"), ("NF-PG", "nf_pg"))
SWEEP = (0.5, 1.0, 1.5, 2.0, 4.0, 8.0, 16.0, 32.0)
FNS = (0.2, 0.3, 0.4)
LAMS = [round(0.30 + 0.01 * i, 2) for i in range(271)]
GRID = [0.0025 * i for i in range(81)]    # zeta3 0 to 0.20, zeta5 0
REF_7ZU = {"GB": 3.39, "NF": 8.69, "NF-P": 4.62, "NF-PG": 3.04}


def omega_of(lam, l):
    return math.sqrt(2.0 * math.pi * G / (lam * l))


def set_damping(h, z3, rel):
    h.set_viscous(z3, 0.0)
    h.relative_damping = rel
    return h


def tank_fit(pr, data):
    """Section B: zeta3 refit (zeta5 0) for each damping form on Kashiwagi's Fig. 2; hold-out on Fig. 3."""
    mean = wt.by_lambda([p for s in wt.SERIES for p in data[s]])
    lams = [x for x, _ in mean]
    am = wt.trap(mean)
    h = st.ModifiedWigleyStrip(mdh.L, mdh.B, mdh.D)
    crit = mdh.critical(h)
    out = {}
    for name, rel in (("absolute", False), ("relative", True)):
        h.relative_damping = rel
        grid = {z3: mdh.sse(mdh.with_damping(h, crit, z3, 0.0), data) for z3 in GRID}
        b3, best = min(grid.items(), key=lambda kv: kv[1])
        near = [z for z, v in grid.items() if v <= mdh.NEAR * best]
        mdh.with_damping(h, crit, b3, 0.0)
        m = mdh.summary(h, data)
        p = wt.Predict(h)
        sp = [(x, (lambda q: q["strip"] + q["refl"])(p.at(x))) for x in lams]
        ratio = wt.trap(sp) / am
        at375 = grid[min(GRID, key=lambda z: abs(z - Z3))]
        pr(f"{name}: best zeta3 {b3:.4f} (edge {b3 in (GRID[0], GRID[-1])}), SSE {best:.4f} (zeta 0 {grid[0.0]:.4f}, "
           f"at 0.0375 {at375:.4f}); within 10%: zeta3 {min(near):.4f}-{max(near):.4f}; heave rms (0.8-2.0) "
           f"{m['heave']:.3f}, pitch rms {m['pitch']:.3f}, mean heave error at 1.0-1.3 {100 * m['heave_res']:+.1f}%; "
           f"hold-out strip+refl area {ratio:.3f} of the measured mean")
        out[name] = dict(z3=b3, sse=best, ratio=ratio, near=(min(near), max(near)), m=m)
    h.relative_damping = False
    return out


def sweep(pr, n, h, u, label, configs):
    out = {}
    for cname, z3, rel in configs:
        set_damping(h, z3, rel)
        rows = {lam: n.response(omega_of(lam, h.l), u) for lam in SWEEP}
        out[cname] = rows
        pr(f"# {label}, {cname}: lam/L |z| " + " ".join(name for name, _ in ROWS) + "  rot rot_newton rot-rot_newton")
        for lam, o in rows.items():
            pr(f"  {lam:5.2f} {abs(o['z']):.4f} " + " ".join(f"{o[key]:.4g}" for _, key in ROWS)
               + f"  {o['rot']:.4g} {o['rot_newton']:.4g} {o['rot'] - o['rot_newton']:.4g}")
    set_damping(h, 0.0, False)
    return out


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    pr("Milestone 7zw: viscous heave damping on the relative vertical velocity (strip.WigleyStrip.relative_damping)")

    # ------------------------------------------------------------------ B. the motion refit
    pr("## B. Kashiwagi (2022) tank hull, Fn 0.2: zeta3 fitted to Fig. 2 motions (zeta5 0), Fig. 3 held out")
    data = wt.read_data()
    fit = tank_fit(pr, data)
    zr = fit["relative"]["z3"]
    a, r = fit["absolute"], fit["relative"]
    w2 = Z3 < zr and 0.03 <= zr <= 0.10 and r["sse"] <= 1.10 * a["sse"]
    pr(f"check: absolute refit zeta3 {a['z3']:.4f}, SSE {a['sse']:.4f} (7zg 0.0375, 0.496), area {a['ratio']:.3f} "
       f"(7zg 1.134)")
    pr(f"W2 relative zeta3 {zr:.4f} > 0.0375 and in 0.03-0.10, SSE {r['sse']:.4f} within 10% of {a['sse']:.4f} "
       f"-> {'held' if w2 else 'refuted'}")
    w3 = abs(r["ratio"] - a["ratio"]) <= 0.02
    pr(f"W3 relative hold-out area {r['ratio']:.3f} within 0.02 of {a['ratio']:.3f} -> {'held' if w3 else 'refuted'}")
    pr(f"(section B {time.time() - t0:.0f} s)")
    out.flush()
    configs = (("zeta 0", 0.0, False), ("abs 0.0375", Z3, False), ("rel 0.0375", Z3, True),
               (f"rel fit {zr:.4f}", zr, True))

    # ------------------------------------------------------------------ A. long-wave sweep
    pr("## A. long-wave sweep (R_aw in N/m2 per unit amplitude^2)")
    mono = a0.Mono()
    mh = st.WigleyStrip(mono.l, mono.b, mono.t, table=mono.table)
    nmh = nf.NearField(mh)
    sm = sweep(pr, nmh, mh, 1.0, "monohull 4 m, 1 m/s", configs)
    hI = st.ModifiedWigleyStrip(jl.L, jl.B, jl.D, kyy=jl.KYY, rho=jl.RHO, alpha=1.0)
    nI = nf.NearField(hI)
    sI = sweep(pr, nI, hI, 0.2 * math.sqrt(G * jl.L), "Wigley I, Fn 0.2", configs)
    w1 = True
    pr("W1 at lambda/L 8 and 16: rot - rot_newton and NF, each over its zeta-0 value (within 25% asked for rel 0.0375)")
    for label, rows in (("monohull", sm), ("Wigley I", sI)):
        for lam in (8.0, 16.0):
            z0 = rows["zeta 0"][lam]
            d0 = z0["rot"] - z0["rot_newton"]
            parts = []
            for cname, _, _ in configs[1:]:
                o = rows[cname][lam]
                rd, rn = (o["rot"] - o["rot_newton"]) / d0, o["nf"] / z0["nf"]
                parts.append(f"{cname}: {rd:.3f}, {rn:.3f}")
                if cname == "rel 0.0375":
                    ok = abs(rd - 1.0) <= 0.25 and (lam != 8.0 or abs(rn - 1.0) <= 0.25)
                    w1 &= ok
            pr(f"  {label} {lam:g} (zeta 0: rot-rot_newton {d0:.4g}, NF {z0['nf']:.4g}): " + "; ".join(parts))
    pr(f"W1 -> {'held' if w1 else 'refuted'}")
    pr(f"(sections B-A {time.time() - t0:.0f} s)")
    out.flush()

    # ------------------------------------------------------------------ C. Journee and the tank hull
    pr("## C. Journee (1992) Wigley I and III peaks over the measured (second-hand, 7zk), absolute 0.0375 vs relative fit")
    integral = rf.waterline_integral(rf.modified_wigley_slope(jl.L, jl.B), jl.L)
    normj = jl.RHO * G * jl.B * jl.B / jl.L
    res = {}
    for name, alpha in jl.HULLS:
        h = hI if alpha == 1.0 else st.ModifiedWigleyStrip(jl.L, jl.B, jl.D, kyy=jl.KYY, rho=jl.RHO, alpha=alpha)
        n = nI if alpha == 1.0 else nf.NearField(h)
        for fn in FNS:
            meas = jl.MEASURED[(name, fn)]
            for dname, z3, rel in (("abs", Z3, False), ("rel", zr, True)):
                set_damping(h, z3, rel)
                rows = npd.curve(n, jl.L, fn * math.sqrt(G * jl.L), normj, LAMS, integral, jl.D, jl.RHO)
                line = []
                for cname, key in ROWS:
                    f = (lambda q, key=key: q[key] + q["falt"]) if key == "gb" else (lambda q, key=key: q[key])
                    v, lam, _ = npd.peak(rows, f)
                    res[(name, fn, dname, cname)] = v / meas
                    line.append(f"{cname} {v:.2f}@{lam:.2f} ({v / meas:.3f})")
                pr(f"{name:>3} Fn {fn} {dname}: measured {meas:.1f}; " + "; ".join(line))
                out.flush()
        set_damping(h, 0.0, False)
    pr("rms and mean of ln(peak / measured) over Journee's five clean peaks (I at Fn 0.4 noisy at source):")
    for dname in ("abs", "rel"):
        for cname, _ in ROWS:
            ls = [math.log(res[(hn, fn, dname, cname)]) for hn in ("I", "III") for fn in FNS if (hn, fn) != ("I", 0.4)]
            pr(f"  {dname} {cname:>6}: rms {math.sqrt(sum(v * v for v in ls) / len(ls)):.3f}, "
               f"mean {sum(ls) / len(ls):+.3f}")
    mv = {(hn, c): res[(hn, 0.2, "rel", c)] / res[(hn, 0.2, "abs", c)] - 1.0 for hn in ("I", "III")
          for c in ("GB", "NF-PG")}
    w4 = all(abs(v) < 0.05 for v in mv.values())
    pr("W4 Fn 0.2 peak, relative fit over absolute: " + "; ".join(f"{k[0]} {k[1]} {100 * v:+.1f}%" for k, v in mv.items())
       + f" (all under 5%) -> {'held' if w4 else 'refuted'}")
    pr("tank hull, Fn 0.2, area on lambda/L 0.3-2.0 over the measured mean (GB with Faltinsen reflection):")
    mean = wt.by_lambda([p for s in wt.SERIES for p in data[s]])
    xs = [x for x, _ in mean]
    am = wt.trap(mean)
    hT = st.ModifiedWigleyStrip(2.0, 0.3, 0.125, kyy=0.248, rho=1000.0)
    nT = nf.NearField(hT)
    intT = rf.waterline_integral(rf.modified_wigley_slope(wt.L, wt.B), wt.L)
    for dname, z3, rel in (("abs", Z3, False), ("rel", zr, True)):
        set_damping(hT, z3, rel)
        rows = npd.curve(nT, wt.L, wt.FN * math.sqrt(G * wt.L), wt.RHO * G * wt.B * wt.B / wt.L, xs, intT, wt.D, wt.RHO)
        pr(f"  {dname}: " + ", ".join(
            f"{name} {npd.trap(xs, [q[key] + (q['falt'] if key == 'gb' else 0.0) for q in rows]) / am:.3f}"
            for name, key in ROWS))
    pr(f"(sections B-C {time.time() - t0:.0f} s)")
    out.flush()

    # ------------------------------------------------------------------ D. the monohull's 30 W loss
    pr("## D. the 4 m monohull's 30 W loss, 7zh pooled bow-sector climate, Faltinsen reflection added, unspliced")
    i_mono = rf.waterline_integral(rf.wigley_slope(mono.l, mono.b), mono.l)
    pr("# table: damping formula pooled_1ms_motion_N loss30W_share025 loss30W_share1 scope200W")
    loss = {}
    for dname, z3, rel in (("abs", Z3, False), ("rel", zr, True), ("rel0375", Z3, True)):
        set_damping(mh, z3, rel)
        cache = nm.Cached(nmh)
        for name, key in ROWS:
            tab = fr.FaltinsenWaveTable(nm.Formula(mh, cache, key), rr.DISP, mono.t01s, i_mono)
            e = fr.mono_eval(mono, tab)
            loss[(dname, name)] = e
            pr(f"row {dname} {name} {e['motion']:.3f} {e['loss25']:.2f} {e['loss1']:.2f} {e['scope']}")
            out.flush()
    L = lambda d, n: -loss[(d, n)]["loss25"]
    w0 = all(abs(L("abs", n) - v) <= 0.01 + 1e-9 for n, v in REF_7ZU.items())
    pr("W0 absolute rows against 7zu: " + ", ".join(f"{n} {L('abs', n):.2f}% ({v}%)" for n, v in REF_7ZU.items())
       + f" -> {'held' if w0 else 'refuted'}")
    d_gb, d_pg = L("rel", "GB") - L("abs", "GB"), L("rel", "NF-PG") - L("abs", "NF-PG")
    gap_a, gap_r = L("abs", "NF") - L("abs", "NF-P"), L("rel", "NF") - L("rel", "NF-P")
    scope = all(e["scope"] for e in loss.values())
    w5 = abs(d_gb) < 0.15 and abs(d_pg) < 0.15 and abs(gap_r) <= 1.0 and scope
    pr(f"W5 relative fit moves GB {d_gb:+.2f} and NF-PG {d_pg:+.2f} points (< 0.15); NF - NF-P {gap_r:+.2f} points "
       f"(<= 1.0; absolute {gap_a:+.2f}); 200 W scope in every row {scope} -> {'held' if w5 else 'refuted'}")
    pr(f"(elapsed {time.time() - t0:.0f} s)")


if __name__ == "__main__":
    main()
