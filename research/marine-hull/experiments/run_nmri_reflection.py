"""Milestone 7zj: the NMRI fine-bow reflection term (ISO 15016:2015 / ITTC 7.5-04-01-01.1) on 7zh's held-out tank data.

    PYTHONPATH=src:experiments python3 experiments/run_nmri_reflection.py > experiments/results_nmri_reflection.txt

Same harness as 7zh (`run_faltinsen_reflection.py`): 7zg's motion-fitted damping, nothing refitted to Kashiwagi (2022)
Fig. 3. The reflection term is R / zeta^2 = 0.5 rho g B B_f alpha_T(1.5 k T) (1 + C_U Fn), C_U = max(10, 68 - 310 B_f),
with B B_f the waterline integral of 7zh. Source status: ISO 15016 and the ITTC procedure were not opened in this
session (egress proxy refused every host probed); the coefficients are as those documents are quoted.

Expectations (committed to LOG.md before the first run, 899e1206e): N1 main short-wave ratio > 1.3; N2 main area ratio
> 1.0 and > 0.929; N3 main sigma rms > 1.289; N4 floor variant (C_U 10) short-wave ratio in 0.7-1.3; N5 monohull 30 W
loss (share 0.25) in 3.4-4.6%; N6 200 W scope holds in every row.
"""
import sys
import time

from marine_hull import reflection as rf
from marine_hull import strip as st
from marine_hull import waves as wv
import run_a0_coupling_transfer as a0
import run_faltinsen_reflection as fr
import run_strip_added_resistance as rs
import run_wave_added_resistance as rw
import run_range_speed as rr
import run_wigley_seakeeping_tank as wt

L, B, D, RHO = wt.L, wt.B, wt.D, wt.RHO
# (tag, draft_arg, cu override, speed term on)
VARIANTS = (("NMRI 1.5kT", 1.5, None, True), ("NMRI kT", 1.0, None, True), ("NMRI CU=10", 1.5, 10.0, True),
            ("NMRI no speed", 1.5, None, False))
MAIN = VARIANTS[0]


class ReflWaveTable:
    """7y's WaveTable shape: (strip motion term, a given reflection RAO) per speed and T01."""

    def __init__(self, hull, speeds, t01s, refl, omegas=wv.OMEGAS):
        self.speeds = speeds
        raos = [[hull.response(w, u)[2] for w in omegas] for u in speeds]
        rr_ = [[refl(w, u) for w in omegas] for u in speeds]
        self.f = {}
        for t01 in sorted(set(t01s)):
            s = [wv.ittc_spectrum(w, 1.0, t01) for w in omegas]
            self.f[t01] = [(2.0 * wv.trap([r * x for r, x in zip(ra, s)], omegas),
                            2.0 * wv.trap([r * x for r, x in zip(rq, s)], omegas)) for ra, rq in zip(raos, rr_)]

    mean = rw.WaveTable.mean


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    data = wt.read_data()
    table = st.ModifiedWigleyStrip(L, B, D).table
    mean = wt.by_lambda([p for s in wt.SERIES for p in data[s]])
    lams = [x for x, _ in mean]
    i_tank = rf.waterline_integral(rf.modified_wigley_slope(L, B), L)
    bf = i_tank / B
    pr("source status: NMRI formula as quoted from ISO 15016:2015 / ITTC 7.5-04-01-01.1 (2017); not opened at source here")
    pr(f"tank hull: modified Wigley L {L:g} B {B:g} d {D:g}, Fn {wt.FN}; B_f {bf:.4f}, C_U {rf.nmri_cu(bf):.2f}, "
       f"speed factor 1 + C_U Fn = {1 + rf.nmri_cu(bf) * wt.FN:.2f}")
    res = {}
    for name, rule, z3, z5 in fr.FITS:
        h = st.ModifiedWigleyStrip(L, B, D, table=table, no_added_mass_coupling=rule)
        h.set_viscous(z3, z5)
        pr(f"## A. tank hull, coupling {name}, 7zg motion fit zeta3 {z3:.4f} zeta5 {z5:.4f}")
        pr("# table: variant area_0.3-2.0 short_0.3-0.6 sigma_rms peak_sigma peak_lambda " +
           " ".join(f"area_{s}" for s in wt.SERIES))
        rows = [("Faltinsen kT speed (7zh)", lambda w, u: rf.rao(w, u, i_tank, D, rho=RHO))]
        for tag, darg, cu, spd in VARIANTS:
            rows.append((tag, (lambda d_, c_, s_: lambda w, u: rf.nmri_rao(w, u, i_tank, B, D, L, rho=RHO, draft_arg=d_,
                                                                           cu=c_, speed=s_))(darg, cu, spd)))
        for tag, fn in rows:
            curve = fr.sigma_curve(h, lams, fn)
            pick = lambda v: v[0] + v[2]
            a = fr.ratio(curve, mean, 0.3, 2.0, pick)
            sh = fr.ratio(curve, mean, 0.3, 0.6, pick)
            rms = a0.rms([pick(v) - m for (_, v), (_, m) in zip(curve, mean)])
            per = []
            for s in wt.SERIES:
                ms = wt.by_lambda(data[s])
                cs = fr.sigma_curve(h, [x for x, _ in ms], fn)
                per.append(wt.trap([(x, pick(v)) for x, v in cs]) / wt.trap(ms))
            fine = fr.sigma_curve(h, [0.30 + 0.01 * i for i in range(171)], fn)
            xb, vb = max(((x, pick(v)) for x, v in fine), key=lambda c: c[1])
            pr(f"row {tag.replace(' ', '_')} {a:.3f} {sh:.3f} {rms:.3f} {vb:.2f} {xb:.2f} " + " ".join(f"{q:.2f}" for q in per))
            res[(name, tag)] = dict(area=a, short=sh, rms=rms)
        pr("short-wave detail (lambda/L, measured mean, strip, Faltinsen refl, NMRI refl main):")
        fmain = lambda w, u: rf.nmri_rao(w, u, i_tank, B, D, L, rho=RHO)
        cf = fr.sigma_curve(h, lams, lambda w, u: rf.rao(w, u, i_tank, D, rho=RHO))
        cn = fr.sigma_curve(h, lams, fmain)
        for (x, v), (_, vn), (_, m) in zip(cf, cn, mean):
            if x <= 0.8 + 1e-9:
                pr(f"  {x:.2f} {m:.3f} {v[0]:.3f} {v[2]:.3f} {vn[2]:.3f}")

    pr("## B. carried to the 4 m monohull (plain coupling, 7zg motion fit)")
    mono = a0.Mono()
    i_mono = rf.waterline_integral(rf.wigley_slope(mono.l, mono.b), mono.l)
    pr(f"monohull L {mono.l:g} B {mono.b:.3f} T {mono.t:.3f}: B_f {i_mono / mono.b:.4f}, C_U {rf.nmri_cu(i_mono / mono.b):.2f}; "
       f"calm 30 W range {mono.calm[0]:.1f} km at {mono.calm[1]:.2f} m/s")
    hull = st.WigleyStrip(mono.l, mono.b, mono.t, table=mono.table)
    hull.set_viscous(0.0375, 0.0)
    pr("# table: reflection pooled_1ms_motion_N pooled_1ms_refl_N loss30W_share025 loss30W_share1 scope200W")
    mrows = {}
    e = fr.mono_eval(mono, rs.StripWaveTable(hull, rr.DISP, mono.t01s))
    mrows["STAWAVE-2"] = e
    pr(f"row STAWAVE-2 {e['motion']:.3f} {e['refl']:.3f} {e['loss25']:.2f} {e['loss1']:.2f} {e['scope']}")
    e = fr.mono_eval(mono, fr.FaltinsenWaveTable(hull, rr.DISP, mono.t01s, i_mono))
    mrows["Faltinsen"] = e
    pr(f"row Faltinsen_kT_speed {e['motion']:.3f} {e['refl']:.3f} {e['loss25']:.2f} {e['loss1']:.2f} {e['scope']}")
    for tag, darg, cu, spd in VARIANTS:
        fn = (lambda d_, c_, s_: lambda w, u: rf.nmri_rao(w, u, i_mono, mono.b, mono.t, mono.l, draft_arg=d_, cu=c_,
                                                          speed=s_))(darg, cu, spd)
        e = fr.mono_eval(mono, ReflWaveTable(hull, rr.DISP, mono.t01s, fn))
        mrows[tag] = e
        pr(f"row {tag.replace(' ', '_')} {e['motion']:.3f} {e['refl']:.3f} {e['loss25']:.2f} {e['loss1']:.2f} {e['scope']}")

    pr("## expectations")
    m = res[("plain", MAIN[0])]
    fa = res[("plain", "Faltinsen kT speed (7zh)")]
    pr(f"N1 main short-wave ratio {m['short']:.3f} > 1.3: {m['short'] > 1.3}")
    pr(f"N2 main area ratio {m['area']:.3f} > 1.0 and > Faltinsen {fa['area']:.3f}: {m['area'] > 1.0 and m['area'] > fa['area']}")
    pr(f"N3 main sigma rms {m['rms']:.3f} > Faltinsen {fa['rms']:.3f}: {m['rms'] > fa['rms']}")
    fl = res[("plain", "NMRI CU=10")]["short"]
    pr(f"N4 floor variant short-wave ratio {fl:.3f} in 0.7-1.3: {0.7 <= fl <= 1.3}")
    lm = abs(mrows[MAIN[0]]["loss25"])
    pr(f"N5 monohull 30 W loss {lm:.2f}% in 3.4-4.6: {3.4 <= lm <= 4.6}")
    pr(f"N6 200 W scope holds in every row: {all(r['scope'] for r in mrows.values())}")
    print(f"runtime {time.time() - t0:.0f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
