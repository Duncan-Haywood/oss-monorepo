"""Milestone 7zr: Gerritsma-Beukelman's forward-speed terms, one at a time.

    PYTHONPATH=src:experiments python3 experiments/run_gb_speed_terms.py > experiments/results_gb_speed_terms.txt

Question: 7zk to 7zp left the strip model at 0.62 to 0.79 of Journee's (1992) measured Fn 0.2 peaks on the L/B 10
Wigley I and III whatever motion model it carries, and named the added-resistance formula's speed dependence as the
least checked part. A second formula's source (Salvesen 1978) could not be opened here (every literature host refused
by the egress proxy), so this step takes the formula already in use apart instead: each forward-speed term of the
Gerritsma-Beukelman (1972) radiated-energy integral

    R_aw = k / (2 omega_e) int (b33 - U da33/dx) |V_z|^2 dx,   V_z = Ds/Dt (with the -U theta term),

is switched off or turned in sign, alone, with everything else of 7zk's main row fixed (7zg damping zeta3 0.0375,
zeta5 0, plain strip coupling, Faltinsen reflection added unchanged). Variants (`strip.WigleyStrip.response`, `gb`):

  V0 base                      the form above (reproduces 7zk)
  V1 no U da/dx in R_aw        b' = b33 in the integrand only (motions unchanged)
  V2 +U da/dx in R_aw          the sign of the speed term turned in the integrand only
  V3 +U da/dx everywhere       the sign turned in the motion equations too (an x-aft convention slip)
  V4 no -U theta in V_z        the relative velocity without the pitch-angle convection term
  V5 k/(2 omega)               the absolute wave frequency in the prefactor

Measured data: Journee's peaks as quoted second-hand (see run_journee_lb10.py), and the same document's quotes of
another open code's own GB peaks (I 35.0, 51.4, 91.8; III 24.0, 49.2, 71.5 at Fn 0.2, 0.3, 0.4), 2 to 3 times ours
at Fn 0.3 to 0.4, a factor 7zk left untraced. Also the Kashiwagi tank hull (area ratio on lambda/L 0.3 to 2.0 at
Fn 0.2, as 7zh) and the 4 m monohull's 30 W loss (7zh's pooled bow-sector climate).

Not blind (disclosed): E0 to E5 were written before any variant ran, then one smoke test ran before they were
committed: Wigley I at Fn 0.2 only, peaks V0 22.25, V1 18.19, V2 14.13, V3 43.63, V4 25.34, V5 33.35. The
expectations were not changed after it; only E0's limit was (U 1e-6 left a 4e-7 residual linear in U, so U 1e-9).

Expectations (committed to LOG.md before the full run):
E0 (code) V0 reproduces 7zk's Fn 0.2 main peaks (22.25, 17.38) to 0.01; at U 1e-9 every variant equals V0 to 1e-6.
E1 (the question) no formula-only variant (V1, V2, V4, V5) brings both Fn 0.2 peak ratios into 0.85 to 1.15.
E2 (the trace) no single variant reproduces all four of the other code's Fn 0.3 and 0.4 peaks within 25%.
E3 V1 and V2 move the Fn 0.2 peak by under 15% on both hulls (the speed term is small near the peak at Fn 0.2).
E4 tank hull area ratio with Faltinsen reflection inside 0.80 to 1.10 for V0, V1, V2 and V4 (V0 0.929 in 7zh).
E5 monohull 30 W loss at share 0.25 inside 3.0% to 4.2% for V0, V1, V2 and V4; the 200 W scope holds for them.
"""
import math
import sys
import time

from marine_hull import reflection as rf
from marine_hull import strip as st
import run_journee_lb10 as jl
import run_wigley_seakeeping_tank as wt

VARIANTS = (
    ("V0 base", {}),
    ("V1 no UdA/dx in Raw", {"raw_sign": 0}),
    ("V2 +UdA/dx in Raw", {"raw_sign": +1}),
    ("V3 +UdA/dx everywhere", {"motion_sign": +1, "raw_sign": +1}),
    ("V4 no -Utheta in Vz", {"u_theta": False}),
    ("V5 k/(2 omega)", {"prefactor": "omega"}),
)
FORMULA_ONLY = ("V1", "V2", "V4", "V5")
CONSISTENT = ("V0", "V1", "V2", "V4")
Z3, Z5 = 0.0375, 0.0
REF_7ZK = {"I": 22.25, "III": 17.38}


class Variant:
    """A strip hull whose response uses one GB variant; everything else forwarded."""

    def __init__(self, hull, gb):
        self.h, self.gb = hull, gb

    def __getattr__(self, name):
        return getattr(self.h, name)

    def response(self, w, u, coupling=None):
        return self.h.response(w, u, coupling=coupling, gb=self.gb)


def journee_curve(h, u, integral):
    """[(lambda/L, strip sigma, Faltinsen sigma, heave RAO)] on 7zk's grid."""
    norm = jl.RHO * st.G * jl.B * jl.B / jl.L
    out = []
    for x in jl.LAMS:
        k = 2.0 * math.pi / (x * jl.L)
        w = math.sqrt(k * st.G)
        z, _, raw, _ = h.response(w, u)
        out.append((x, raw / norm, rf.rao(w, u, integral, jl.D, rho=jl.RHO) / norm, abs(z)))
    return out


def code_checks(pr, hulls):
    worst = 0.0
    for name, h in hulls.items():
        for lam in (0.6, 1.0, 1.5):
            w = math.sqrt(2.0 * math.pi / (lam * jl.L) * st.G)
            z0, t0, r0, _ = h.response(w, 1e-9)
            for _, gb in VARIANTS[1:]:
                z, t, r, _ = h.response(w, 1e-9, gb=gb)
                if gb.get("prefactor") == "omega":
                    continue            # at U -> 0, omega_e -> omega: checked below on the ratio instead
                worst = max(worst, abs(z - z0), abs(t - t0), abs(r / r0 - 1))
            z, t, r, we = h.response(w, 1e-9, gb={"prefactor": "omega"})
            worst = max(worst, abs(r / r0 - 1) - abs(we / w - 1))
    pr(f"check: at U 1e-9 every variant equals V0 (max abs/rel difference {worst:.1e})")
    return worst


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    integral = rf.waterline_integral(rf.modified_wigley_slope(jl.L, jl.B), jl.L)
    base = {}
    for name, alpha in jl.HULLS:
        h = st.ModifiedWigleyStrip(jl.L, jl.B, jl.D, kyy=jl.KYY, rho=jl.RHO, alpha=alpha)
        h.set_viscous(Z3, Z5)
        base[name] = h
    worst = code_checks(pr, base)

    pr("## A. Journee's Wigley I and III (L/B 10), 7zg damping, strip GB + Faltinsen reflection")
    pr("# table: hull variant Fn peak@lambda ratio_measured ratio_other_code strip_only_peak heave_RAO_max@lambda")
    res = {}
    for name, _ in jl.HULLS:
        for vname, gb in VARIANTS:
            h = Variant(base[name], gb)
            for fn in jl.FNS:
                u = fn * math.sqrt(st.G * jl.L)
                cv = journee_curve(h, u, integral)
                xb, pk = max(((r[0], r[1] + r[2]) for r in cv), key=lambda c: c[1])
                so = max(r[1] for r in cv)
                hz = max(cv, key=lambda r: r[3])
                m, o = jl.MEASURED[(name, fn)], jl.OTHER_GB[(name, fn)]
                res[(name, vname[:2], fn)] = dict(peak=pk, ratio=pk / m, other=so / o)
                pr(f"row {name} {vname.replace(' ', '_')} {fn:.1f} {pk:.2f}@{xb:.2f} {pk / m:.3f} {so / o:.3f} "
                   f"{so:.2f} {hz[3]:.3f}@{hz[0]:.2f}")

    pr("## B. Fn trend against the measured peaks: rms of ln(model/measured)")
    pr("# table: variant rms_all6 rms_5_without_noisy_I_0.4 mean_ln_ratio_5")
    trend = {}
    for vname, _ in VARIANTS:
        v = vname[:2]
        lr = {(n, f): math.log(res[(n, v, f)]["ratio"]) for n, _ in jl.HULLS for f in jl.FNS}
        five = [x for key, x in lr.items() if key != ("I", 0.4)]
        r6 = math.sqrt(sum(x * x for x in lr.values()) / 6)
        r5 = math.sqrt(sum(x * x for x in five) / 5)
        trend[v] = r5
        pr(f"row {vname.replace(' ', '_')} {r6:.3f} {r5:.3f} {sum(five) / 5:+.3f}")

    pr("## C. Kashiwagi tank hull (L/B 6.67) at Fn 0.2, 7zg damping, Faltinsen reflection: area on 0.3-2.0 / measured")
    data = wt.read_data()
    mean = wt.by_lambda([p for s in wt.SERIES for p in data[s]])
    i_tank = rf.waterline_integral(rf.modified_wigley_slope(wt.L, wt.B), wt.L)
    tank = st.ModifiedWigleyStrip(wt.L, wt.B, wt.D)
    tank.set_viscous(Z3, Z5)
    u_t = wt.FN * math.sqrt(st.G * wt.L)
    norm_t = wt.RHO * st.G * wt.B * wt.B / wt.L
    pr("# table: variant area_ratio peak_sigma@lambda")
    area = {}
    for vname, gb in VARIANTS:
        cv = []
        for x, _ in mean:
            w = math.sqrt(2.0 * math.pi / (x * wt.L) * st.G)
            raw = tank.response(w, u_t, gb=gb)[2]
            cv.append((x, (raw + rf.rao(w, u_t, i_tank, wt.D, rho=wt.RHO)) / norm_t))
        a = wt.trap(cv) / wt.trap(mean)
        area[vname[:2]] = a
        xb, vb = max(cv, key=lambda c: c[1])
        pr(f"row {vname.replace(' ', '_')} {a:.3f} {vb:.2f}@{xb:.2f}")

    pr("## D. the 4 m monohull (L/B 10, Fn ~0.16 at 1 m/s), 7zg damping, Faltinsen reflection, 7zh climate")
    import run_a0_coupling_transfer as a0
    import run_faltinsen_reflection as fr
    import run_range_speed as rr
    mono = a0.Mono()
    i_mono = rf.waterline_integral(rf.wigley_slope(mono.l, mono.b), mono.l)
    mh = st.WigleyStrip(mono.l, mono.b, mono.t, table=mono.table)
    mh.set_viscous(Z3, Z5)
    pr("# table: variant pooled_1ms_motion_N pooled_1ms_refl_N loss30W_share025 loss30W_share1 scope200W")
    mres = {}
    for vname, gb in VARIANTS:
        e = fr.mono_eval(mono, fr.FaltinsenWaveTable(Variant(mh, gb), rr.DISP, mono.t01s, i_mono))
        mres[vname[:2]] = e
        pr(f"row {vname.replace(' ', '_')} {e['motion']:.3f} {e['refl']:.3f} {e['loss25']:.2f} {e['loss1']:.2f} "
           f"{e['scope']}")

    pr("## expectations")
    r = lambda n, v, f: res[(n, v, f)]
    e0 = all(abs(r(n, "V0", 0.2)["peak"] - REF_7ZK[n]) <= 0.01 for n in REF_7ZK) and worst <= 1e-6
    pr(f"E0 V0 Fn 0.2 peaks I {r('I', 'V0', 0.2)['peak']:.3f}, III {r('III', 'V0', 0.2)['peak']:.3f} (7zk 22.25, "
       f"17.38); U->0 difference {worst:.1e}: {e0}")
    inside = [v for v in FORMULA_ONLY if all(0.85 <= r(n, v, 0.2)["ratio"] <= 1.15 for n, _ in jl.HULLS)]
    pr("E1 Fn 0.2 ratios (I, III): " + "; ".join(
        f"{v} {r('I', v, 0.2)['ratio']:.3f} {r('III', v, 0.2)['ratio']:.3f}" for v in FORMULA_ONLY) +
       f"; formula-only variants with both in 0.85-1.15: {inside or 'none'}: {not inside}")
    hit = [v for v, _ in ((x[:2], 0) for x, _ in VARIANTS)
           if all(abs(r(n, v, f)["other"] - 1) <= 0.25 for n, _ in jl.HULLS for f in (0.3, 0.4))]
    pr("E2 strip-only peak / other code's GB peak at Fn 0.3, 0.4 (I, I, III, III): " + "; ".join(
        f"{v[:2]} " + " ".join(f"{r(n, v[:2], f)['other']:.2f}" for n, _ in jl.HULLS for f in (0.3, 0.4))
        for v, _ in VARIANTS) + f"; variants within 25% on all four: {hit or 'none'}: {not hit}")
    mv = {(n, v): r(n, v, 0.2)["peak"] / r(n, "V0", 0.2)["peak"] - 1 for n, _ in jl.HULLS for v in ("V1", "V2")}
    pr("E3 Fn 0.2 peak change: " + ", ".join(f"{n} {v} {100 * x:+.1f}%" for (n, v), x in mv.items()) +
       f" under 15%: {all(abs(x) < 0.15 for x in mv.values())}")
    pr("E4 tank area ratios " + ", ".join(f"{v} {area[v]:.3f}" for v in CONSISTENT) +
       f" in 0.80-1.10: {all(0.80 <= area[v] <= 1.10 for v in CONSISTENT)}")
    # loss25 is printed as the (negative) range change, as in 7zh; the expectation is on its size
    pr("E5 monohull 30 W loss " + ", ".join(f"{v} {-mres[v]['loss25']:.2f}%" for v in CONSISTENT) +
       f" in 3.0-4.2% and scope holds: "
       f"{all(3.0 <= -mres[v]['loss25'] <= 4.2 and mres[v]['scope'] for v in CONSISTENT)}")
    pr("best Fn-trend variant (rms ln ratio, 5 points): " + min(trend, key=trend.get) +
       f" {min(trend.values()):.3f} (V0 {trend['V0']:.3f})")
    print(f"runtime {time.time() - t0:.0f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
