"""Milestone 7zv: panel and station convergence of the near field's X . grad p term (7zu) and of its long-wave tail.

    PYTHONPATH=src:experiments python3 experiments/run_nearfield_convergence.py > experiments/results_nearfield_convergence.txt
    PYTHONPATH=src:experiments python3 experiments/run_nearfield_convergence.py B24 > experiments/results_nearfield_convergence_b24.txt

The first command runs section A and section B at (16, 30) (C0 to C4, about 25 min); the second runs section B at
(24, 40) alone and checks C5 against 7zu's (16, 30) values, which C0 reproduces (about 17 min). The split is a
runtime one: the single run was stopped by the session's 30-minute background limit during the (24, 40) grid.

No new physics: `marine_hull.nearfield.NearField` and the strip hulls are unchanged, with `n_panels` (per half
section, used by both the motions' section table and the near field's panel-potential table) and `n_stations` varied
together. Plan and expectations C0 to C5 are in LOG.md (committed before this code).

    A  Wigley I (Journee 1992, second-hand as 7zk) at Fn 0.2, 7zg damping: panels 12, 16, 20, 24 at 30 stations and
       stations 20, 30, 40, 60 at 16 panels. Peaks on lambda/L 0.90 to 1.30 by 0.01, the X . grad p term at the
       NF-PG peak, and the long-wave values at lambda/L 8 and 16.
    B  the 4 m monohull's 30 W loss (7zu section C) at (16 panels, 30 stations) and (24, 40).
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

G = st.G
Z3, Z5 = 0.0375, 0.0
PEAK_ROWS = (("GB+F", "gb"), ("NF-P", "nf_p"), ("NF0-P", "nf0_p"), ("NF-PG", "nf_pg"), ("NF0-PG", "nf0_pg"))
LONG_KEYS = ("gb", "vel", "vel0", "nf_p", "nf0_p", "nf_pg", "grad")
LAMS = [round(0.90 + 0.01 * i, 2) for i in range(41)]
PANELS = (12, 16, 20, 24)
STATIONS = (20, 30, 40, 60)
MONO_ROWS = (("GB", "gb"), ("NF-P", "nf_p"), ("NF0-P", "nf0_p"), ("NF-PG", "nf_pg"), ("NF0-PG", "nf0_pg"))
REF_7ZU = {"GB": 3.39, "NF-P": 4.62, "NF0-P": 3.08, "NF-PG": 3.04, "NF0-PG": 2.02}


def wigley_grid(n_panels, n_stations):
    """Section A values for Wigley I at Fn 0.2, 7zg damping, on one grid (sigma units)."""
    h = st.ModifiedWigleyStrip(jl.L, jl.B, jl.D, kyy=jl.KYY, rho=jl.RHO, alpha=1.0,
                               n_stations=n_stations, n_panels=n_panels)
    n = nf.NearField(h, n_panels=n_panels)
    h.set_viscous(Z3, Z5)
    u = 0.2 * math.sqrt(G * jl.L)
    norm = jl.RHO * G * jl.B * jl.B / jl.L
    integral = rf.waterline_integral(rf.modified_wigley_slope(jl.L, jl.B), jl.L)
    rows = npd.curve(n, jl.L, u, norm, LAMS, integral, jl.D, jl.RHO)
    out = {}
    for name, key in PEAK_ROWS:
        f = (lambda r, key=key: r[key] + r["falt"]) if key == "gb" else (lambda r, key=key: r[key])
        v, lam, _ = npd.peak(rows, f)
        out[name] = (v, lam)
    _, _, best = npd.peak(rows, lambda r: r["nf_pg"])
    out["grad@pk"] = best["grad"]
    out["grad0@pk"] = best["grad0"]
    for lam in (8.0, 16.0):
        o = npd.curve(n, jl.L, u, norm, [lam])[0]
        for key in LONG_KEYS:
            out[(key, lam)] = o[key]
    return out


def order(f1, f2, f3, r):
    """Observed order from three grids refined by a constant ratio r (f3 finest); None when not monotone."""
    a, b = f1 - f2, f2 - f3
    if a == 0.0 or b == 0.0 or a * b < 0.0:
        return None
    return math.log(a / b) / math.log(r)


def section_b(pr, grids):
    """Section B rows for the given (panels, stations) grids: {(panels, stations, row): mono_eval result}."""
    mono = a0.Mono()
    i_mono = rf.waterline_integral(rf.wigley_slope(mono.l, mono.b), mono.l)
    loss = {}
    for npan, nst in grids:
        t1 = time.time()
        if (npan, nst) == (16, 30):
            mh = st.WigleyStrip(mono.l, mono.b, mono.t, table=mono.table)
        else:
            mh = st.WigleyStrip(mono.l, mono.b, mono.t, n_stations=nst, n_panels=npan)
        n = nf.NearField(mh, n_panels=npan)
        mh.set_viscous(Z3, Z5)
        cache = nm.Cached(n)
        for name, key in MONO_ROWS:
            tab = fr.FaltinsenWaveTable(nm.Formula(mh, cache, key), rr.DISP, mono.t01s, i_mono)
            e = fr.mono_eval(mono, tab)
            loss[(npan, nst, name)] = e
            pr(f"row P{npan} S{nst} {name} motion {e['motion']:.3f} N loss30W_share025 {-e['loss25']:.2f}% "
               f"share1 {-e['loss1']:.2f}% scope200W {e['scope']}")
        pr(f"  (grid P{npan} S{nst}: {time.time() - t1:.0f} s, {len(cache.memo)} near-field evaluations)")
    return loss


def main_b24(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    pr("Milestone 7zv, section B at (24 panels, 40 stations): the 4 m monohull's 30 W loss at share 0.25")
    pr("7zh climate, Faltinsen reflection, 7zg damping; (16, 30) reference = 7zu's rows, reproduced by C0 in "
       "results_nearfield_convergence.txt")
    loss = section_b(pr, [(24, 40)])
    d = {nm_: -loss[(24, 40, nm_)]["loss25"] - ref for nm_, ref in REF_7ZU.items()}
    scope = all(e["scope"] for e in loss.values())
    c5 = all(abs(v) <= 0.25 for v in d.values()) and scope
    pr("C5 change (24, 40) - (16, 30) in points: " + ", ".join(f"{k} {v:+.2f}" for k, v in d.items())
       + f" (<= 0.25); 200 W scope in every row {scope} -> {'held' if c5 else 'refuted'}")
    pr(f"(elapsed {time.time() - t0:.0f} s)")


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    pr("Milestone 7zv: panel and station convergence of the near field's X . grad p term (7zu)")
    pr("Wigley I, Fn 0.2, 7zg damping (zeta3 0.0375, zeta5 0); sigma = R / (rho g a^2 B^2 / L); "
       f"Journee's measured Fn 0.2 peak {jl.MEASURED[('I', 0.2)]:.1f}")

    # ------------------------------------------------------------------ A. Wigley I grids
    pr("## A. grids (panels per half section, stations)")
    grids = [(p, 30) for p in PANELS] + [(16, s) for s in STATIONS if s != 30]
    res = {}
    pr("# grid: " + " ".join(f"{n}_peak@lam" for n, _ in PEAK_ROWS) + " grad@NF-PG-peak grad0@peak | lam/L 8: "
       + " ".join(LONG_KEYS) + " | lam/L 16: " + " ".join(LONG_KEYS))
    for g in grids:
        t1 = time.time()
        r = wigley_grid(*g)
        res[g] = r
        pr(f"P{g[0]:>2} S{g[1]:>2}: " + " ".join(f"{r[n][0]:.3f}@{r[n][1]:.2f}" for n, _ in PEAK_ROWS)
           + f" {r['grad@pk']:.3f} {r['grad0@pk']:.3f} | " + " ".join(f"{r[(k, 8.0)]:.4g}" for k in LONG_KEYS)
           + " | " + " ".join(f"{r[(k, 16.0)]:.4g}" for k in LONG_KEYS) + f"  ({time.time() - t1:.0f} s)")
        out.flush()
    meas = jl.MEASURED[("I", 0.2)]
    pr("peak over Journee's measured Fn 0.2 peak:")
    for g in grids:
        pr(f"  P{g[0]:>2} S{g[1]:>2}: " + " ".join(f"{n} {res[g][n][0] / meas:.3f}" for n, _ in PEAK_ROWS))

    base = res[(16, 30)]
    gbs = [res[g]["GB+F"][0] for g in grids]
    c1 = (max(gbs) - min(gbs)) / base["GB+F"][0]
    pr(f"C1 GB+F peak spread over the seven grids {100 * c1:.2f}% of the (16, 30) value (< 3%) -> "
       f"{'held' if c1 < 0.03 else 'refuted'}")
    dp = res[(24, 30)]["grad@pk"] / base["grad@pk"] - 1.0
    ds = res[(16, 60)]["grad@pk"] / base["grad@pk"] - 1.0
    ratios = [res[g]["NF-PG"][0] / meas for g in grids if g[0] >= 16 and g[1] >= 30]
    c2 = abs(dp) < 0.10 and abs(ds) < 0.10 and all(0.68 <= x <= 0.75 for x in ratios)
    pr(f"C2 grad at the NF-PG peak: 16 -> 24 panels {100 * dp:+.2f}%, 30 -> 60 stations {100 * ds:+.2f}% (< 10%); "
       f"NF-PG / Journee on grids P>=16, S>=30: {min(ratios):.3f} to {max(ratios):.3f} (0.68-0.75) -> "
       f"{'held' if c2 else 'refuted'}")

    pr("observed station order p from f(S) = f_inf + C S^-p: (f20 - f40) / (f30 - f60) = 1.5^p; Richardson "
       "f_inf = f60 - (f30 - f60) / (2^p - 1) where 0.5 <= p <= 4; panels: the 24 against 16 change")
    for key, label in (("grad@pk", "grad@peak"), ("NF-PG", "NF-PG peak"), ("NF-P", "NF-P peak"),
                       ("GB+F", "GB+F peak"), (("vel", 8.0), "vel lam/L 8"), (("nf_pg", 8.0), "NF-PG lam/L 8"),
                       (("nf_p", 8.0), "NF-P lam/L 8")):
        v = lambda g: res[g][key][0] if isinstance(res[g][key], tuple) else res[g][key]
        s_seq = [v((16, s)) for s in STATIONS]
        p_seq = [v((p, 30)) for p in PANELS]
        # three-grid order on stations 20, 30, 40 is not constant-ratio; use 20 -> 40 and 30 -> 60 differences:
        # e(h) ~ C h^p, so (f20 - f40) / (f30 - f60) = (20^-p - 40^-p) / (30^-p - 60^-p) = (3/2)^p
        a, b = s_seq[0] - s_seq[2], s_seq[1] - s_seq[3]
        p_s = math.log(a / b) / math.log(1.5) if a * b > 0 else None
        rich = None
        if p_s is not None and 0.5 <= p_s <= 4.0:
            rich = s_seq[3] - b / (2.0 ** p_s - 1.0)
        pr(f"  {label:>14}: stations 20/30/40/60 " + " ".join(f"{x:.4g}" for x in s_seq)
           + f"; order {('%.2f' % p_s) if p_s is not None else 'n/a'}; Richardson S->inf "
           + (f"{rich:.4g} ({100 * (rich / s_seq[3] - 1):+.1f}% from S60)" if rich is not None else "n/a")
           + "; panels 12/16/20/24 " + " ".join(f"{x:.4g}" for x in p_seq)
           + f" (24 vs 16 {100 * (p_seq[3] / p_seq[1] - 1):+.2f}%)")
    def s_order(key):
        s_seq = [res[(16, s)][key][0] if isinstance(res[(16, s)][key], tuple) else res[(16, s)][key]
                 for s in STATIONS]
        a, b = s_seq[0] - s_seq[2], s_seq[1] - s_seq[3]
        return math.log(a / b) / math.log(1.5) if a * b > 0 else None
    og, on = s_order("grad@pk"), s_order("NF-P")
    c3 = og is not None and on is not None and og >= 0.8 * on
    pr(f"C3 observed station order of grad@peak {og if og is None else round(og, 2)} against NF-P peak's "
       f"{on if on is None else round(on, 2)} (>= 0.8 times) -> {'held' if c3 else 'refuted'}")
    v30, v60 = res[(16, 30)][("vel", 8.0)], res[(16, 60)][("vel", 8.0)]
    c4 = abs(v60 / v30 - 1.0) < 0.25
    pr(f"C4 velocity term at lambda/L 8: S30 {v30:.4g}, S60 {v60:.4g} ({100 * (v60 / v30 - 1):+.1f}%, < 25%) -> "
       f"{'held' if c4 else 'refuted'}")
    pr(f"(section A {time.time() - t0:.0f} s)")
    out.flush()

    # ------------------------------------------------------------------ B. the monohull's 30 W loss
    pr("## B. the 4 m monohull's 30 W loss at share 0.25, 7zh climate, Faltinsen reflection, 7zg damping")
    loss = section_b(pr, [(16, 30)])
    c0 = all(abs(-loss[(16, 30, nm_)]["loss25"] - ref) <= 0.01 + 1e-9 for nm_, ref in REF_7ZU.items())
    pr(f"C0 (16, 30) reproduces 7zu's 30 W losses {REF_7ZU} to 0.01 points -> {'held' if c0 else 'refuted'}")
    pr("C5: see results_nearfield_convergence_b24.txt (the (24, 40) grid, run separately)")
    pr(f"(elapsed {time.time() - t0:.0f} s)")


if __name__ == "__main__":
    main_b24() if sys.argv[1:] == ["B24"] else main()
