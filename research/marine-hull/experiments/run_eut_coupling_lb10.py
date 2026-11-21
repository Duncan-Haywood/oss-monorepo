"""Milestone 7zp: is the heave-pitch coupling what Journee's L/B 10 hulls are missing?

    PYTHONPATH=src:experiments python3 experiments/run_eut_coupling_lb10.py > experiments/results_eut_coupling_lb10.txt

Kashiwagi's (2022) modified-EUT and measured cross-coupling A35, B35, A53, B53 (7ze's digitised
`data/kashiwagi2022_curves_fn020.csv`, the L/B 6.67 tank hull at Fn 0.2) carried to the strip motions of Journee's
(1992) Wigley I and III (L/B 10, 7zk's second-hand peaks) at Fn 0.2, and to the 4 m monohull. Only the coupling
added mass and damping in the motion equations change (`WigleyStrip.response(..., coupling=...)`); the GB formula,
Faltinsen's reflection term and 7zg's damping are 7zk's.

Transfer rules (nondimensional, rho V L for A and rho V L sqrt(g/L) for B, read at the target's own
KL = omega_e^2 L / g; KL outside the curves' range clamped to the ends, as 7ze):
T0 the target's own strip coupling through the override (code check: reproduces 7zk);
T1 direct: the tank hull's modified-EUT values unchanged;
T2 correction: the target's strip values plus the tank hull's (modified EUT - strip) difference;
T3 measured coefficients (7ze's smoothing), direct;
T4 7ze's rule A35 = A53 = 0 with the strip's B35 and B53.

Expectations (committed to LOG.md before the first run, commit 1c4d73f94):
K0 T0 reproduces 7zk's main-row peaks (22.25, 17.38) to 1e-6 relative; on the tank hull T1 = T2 and give 7ze's +4.9%;
K1 T1 and T2 move the Fn 0.2 main-row peak by under 8% on both hulls, so both ratios stay under 0.85;
K2 T1 and T2 peaks within 10% of each other on both hulls;
K3 T3 lowers both ratios below 7zk's;
K4 with zeta 0 and T2 both ratios stay under 0.90;
K5 monohull 30 W loss at share 0.25 with T2 (correction x Fn/0.2) in 3.2%-3.6%, 200 W scope holds.
"""
import math
import sys
import time

from marine_hull import reflection as rf
from marine_hull import strip as st
import run_journee_lb10 as jl
import run_kashiwagi_baselines as kb
import run_wigley_seakeeping_tank as wt

FN = 0.2
COEFS = kb.COEFS                      # A35, B35, A53, B53
RULES = ("T0 own strip", "T1 EUT direct", "T2 EUT correction", "T3 measured direct", "T4 A35=A53=0")


class Tank:
    """Nondimensional coupling sources on Kashiwagi's L/B 6.67 hull at Fn 0.2, as functions of KL."""

    def __init__(self):
        self.cur = kb.read_curves()
        self.smooth = {c: kb.smooth_measured(self.cur[(c, "experiment")]) for c in COEFS}
        self.hull = st.ModifiedWigleyStrip(wt.L, wt.B, wt.D)
        self.u = FN * math.sqrt(st.G * wt.L)
        self.nd = nd_scales(self.hull)
        self._strip = {}

    def eut(self, kl):
        return [kb.interp(self.cur[(c, "modified EUT")], kl, clamp=True) for c in COEFS]

    def measured(self, kl):
        return [kb.interp(self.smooth[c], kl, clamp=True) for c in COEFS]

    def strip(self, kl):
        key = round(kl, 6)
        if key not in self._strip:
            we = math.sqrt(kl * st.G / wt.L)
            self._strip[key] = to_nd(self.hull.cross_coupling(we, self.u), self.nd)
        return self._strip[key]


def nd_scales(h):
    a = h.rho * h.vol * h.l
    return a, a * math.sqrt(st.G / h.l)


def to_nd(c, nd):
    return [v / (nd[0] if name[0] == "A" else nd[1]) for v, name in zip(c, COEFS)]


def to_dim(c, nd):
    return tuple(v * (nd[0] if name[0] == "A" else nd[1]) for v, name in zip(c, COEFS))


def coupling(rule, hull, tank, scale_by_fn=False):
    """omega_e, u -> dimensional (A35, B35, A53, B53), bow-down convention, for hull under rule."""
    nd = nd_scales(hull)

    def f(we, u):
        kl = we * we * hull.l / st.G
        own = hull.cross_coupling(we, u)
        if rule.startswith("T0"):
            return own
        if rule.startswith("T4"):
            return 0.0, own[1], 0.0, own[3]
        if rule.startswith("T1"):
            return to_dim(tank.eut(kl), nd)
        if rule.startswith("T3"):
            return to_dim(tank.measured(kl), nd)
        s = (u / math.sqrt(st.G * hull.l)) / FN if scale_by_fn else 1.0
        corr = [e - t for e, t in zip(tank.eut(kl), tank.strip(kl))]
        return to_dim([o + s * d for o, d in zip(to_nd(own, nd), corr)], nd)
    return f


class Coupled:
    """A strip hull whose response uses an overridden cross-coupling; everything else forwarded."""

    def __init__(self, hull, cf):
        self.h, self.cf = hull, cf

    def __getattr__(self, name):
        return getattr(self.h, name)

    def response(self, w, u):
        return self.h.response(w, u, coupling=lambda we: self.cf(we, u))


def tank_check(pr, tank):
    meas = wt.read_data()
    pts = [(x, v) for x, v in sorted(meas["heave"]) if 1.0 <= x <= 1.3 + 1e-9]
    out = {}
    for rule in ("T1 EUT direct", "T2 EUT correction"):
        h = Coupled(tank.hull, coupling(rule, tank.hull, tank))
        errs = []
        for x, v in pts:
            w = math.sqrt(2 * math.pi / (x * wt.L) * st.G)
            errs.append(abs(h.response(w, tank.u)[0]) / v - 1)
        out[rule] = sum(errs) / len(errs)
    w = math.sqrt(2 * math.pi / (1.1 * wt.L) * st.G)
    z1 = Coupled(tank.hull, coupling("T1 EUT direct", tank.hull, tank)).response(w, tank.u)
    z2 = Coupled(tank.hull, coupling("T2 EUT correction", tank.hull, tank)).response(w, tank.u)
    diff = max(abs(z1[0] - z2[0]), abs(z1[1] - z2[1]), abs(z1[2] - z2[2]) / abs(z1[2]))
    pr(f"tank hull (L/B 6.67): mean heave error at lambda/L 1.0-1.3 T1 {100 * out['T1 EUT direct']:+.2f}%, "
       f"T2 {100 * out['T2 EUT correction']:+.2f}% (7ze: +4.9%); T1 vs T2 max difference at lambda/L 1.1 {diff:.1e}")
    return out, diff


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    tank = Tank()
    pr("## K0. code checks")
    tk, tdiff = tank_check(pr, tank)
    integral = rf.waterline_integral(rf.modified_wigley_slope(jl.L, jl.B), jl.L)
    u = FN * math.sqrt(st.G * jl.L)
    res = {}
    for name, alpha in jl.HULLS:
        h = st.ModifiedWigleyStrip(jl.L, jl.B, jl.D, kyy=jl.KYY, rho=jl.RHO, alpha=alpha)
        cb = h.vol / (jl.L * jl.B * jl.D)
        nd = nd_scales(h)
        pr(f"## Wigley {name} (alpha {alpha:g}), Fn {FN}: nondimensional coupling at KL 3, 5, 10, 20 "
           "(A35 B35 A53 B53): own strip | tank strip | tank modified EUT")
        for kl in (3, 5, 10, 20):
            we = math.sqrt(kl * st.G / jl.L)
            own = to_nd(h.cross_coupling(we, u), nd)
            pr(f"  KL {kl:>2}: " + " ".join(f"{v:+.4f}" for v in own) + " | " +
               " ".join(f"{v:+.4f}" for v in tank.strip(kl)) + " | " + " ".join(f"{v:+.4f}" for v in tank.eut(kl)))
        for dname, z3, z5 in jl.DAMPING[:2]:
            h.set_viscous(z3, z5)
            pr(f"# damping {dname} (zeta3 {z3:g}, zeta5 {z5:g})")
            pr("# table: rule strip_GB(peak@lam) +Faltinsen(peak@lam) ratio_to_measured heave_RAO_peak@lam")
            base = jl.curves(h, u, cb, integral)
            bpk = jl.peak(base, 2)
            res[(name, dname, "plain")] = bpk[0]
            for rule in RULES:
                cv = jl.curves(Coupled(h, coupling(rule, h, tank)), u, cb, integral)
                p0, p2 = jl.peak(cv, 0), jl.peak(cv, 2)
                hz = max(cv, key=lambda r: r[5])
                m = jl.MEASURED[(name, FN)]
                res[(name, dname, rule)] = p2[0]
                pr(f"row {rule.split()[0]} {p0[0]:.2f}@{p0[1]:.2f} {p2[0]:.2f}@{p2[1]:.2f} {p2[0] / m:.3f} "
                   f"{hz[5]:.3f}@{hz[0]:.2f}")
            pr(f"  (no override: +Faltinsen peak {bpk[0]:.2f}@{bpk[1]:.2f}, ratio {bpk[0] / jl.MEASURED[(name, FN)]:.3f})")

    pr("## expectations")
    main_d, z0 = jl.DAMPING[0][0], jl.DAMPING[1][0]
    g = lambda n, r, d=main_d: res[(n, d, r)]
    ratio = lambda n, r, d=main_d: g(n, r, d) / jl.MEASURED[(n, FN)]
    names = [n for n, _ in jl.HULLS]
    k0a = max(abs(g(n, RULES[0]) / g(n, "plain") - 1) for n in names)
    k0 = k0a < 1e-6 and tdiff < 1e-9 and abs(tk["T1 EUT direct"] - 0.049) < 0.001
    pr(f"K0 T0 vs no override max relative {k0a:.1e}; tank T1 = T2 to {tdiff:.1e}; tank T1 heave error "
       f"{100 * tk['T1 EUT direct']:+.2f}% vs +4.9%: {k0}")
    mv = {(n, r): g(n, r) / g(n, RULES[0]) - 1 for n in names for r in RULES[1:3]}
    k1 = all(abs(v) < 0.08 for v in mv.values()) and all(ratio(n, r) < 0.85 for n in names for r in RULES[1:3])
    pr("K1 peak change vs own strip: " + ", ".join(f"{n} {r.split()[0]} {100 * v:+.1f}% (ratio {ratio(n, r):.3f})"
                                                  for (n, r), v in mv.items()) + f"; all < 8% and ratio < 0.85: {k1}")
    k2 = all(abs(g(n, RULES[1]) / g(n, RULES[2]) - 1) < 0.10 for n in names)
    pr("K2 T1/T2 " + ", ".join(f"{n} {g(n, RULES[1]) / g(n, RULES[2]):.3f}" for n in names) + f" within 10%: {k2}")
    k3 = all(ratio(n, RULES[3]) < ratio(n, RULES[0]) for n in names)
    pr("K3 T3 ratio " + ", ".join(f"{n} {ratio(n, RULES[3]):.3f} vs {ratio(n, RULES[0]):.3f}" for n in names) +
       f" lower: {k3}")
    k4 = all(ratio(n, RULES[2], z0) < 0.90 for n in names)
    pr("K4 zeta 0 with T2 " + ", ".join(f"{n} {ratio(n, RULES[2], z0):.3f}" for n in names) + f" < 0.90: {k4}")
    mono(pr, tank)
    print(f"runtime {time.time() - t0:.0f} s", file=sys.stderr)


def mono(pr, tank):
    import run_a0_coupling_transfer as a0
    import run_faltinsen_reflection as fr
    import run_range_speed as rr
    pr("## M. the 4 m monohull, 7zg damping, Faltinsen reflection (sensitivity: correction x Fn/0.2 at each speed)")
    m = a0.Mono()
    i_mono = rf.waterline_integral(rf.wigley_slope(m.l, m.b), m.l)
    hull = st.WigleyStrip(m.l, m.b, m.t, table=m.table)
    hull.set_viscous(0.0375, 0.0)
    pr("# table: rule pooled_1ms_motion_N pooled_1ms_refl_N loss30W_share025 loss30W_share1 scope200W")
    rows = {}
    for tag, h in (("none (7zh row)", hull),
                   ("T2 x Fn/0.2", Coupled(hull, coupling("T2", hull, tank, scale_by_fn=True))),
                   ("T2 unscaled", Coupled(hull, coupling("T2", hull, tank))),
                   ("T4 A35=A53=0", Coupled(hull, coupling("T4", hull, tank)))):
        e = fr.mono_eval(m, fr.FaltinsenWaveTable(h, rr.DISP, m.t01s, i_mono))
        rows[tag] = e
        pr(f"row {tag.replace(' ', '_')} {e['motion']:.3f} {e['refl']:.3f} {e['loss25']:.2f} {e['loss1']:.2f} "
           f"{e['scope']}")
    e = rows["T2 x Fn/0.2"]
    # loss25 is printed as the (negative) range change, as in 7zh; the expectation is on its size
    pr(f"K5 30 W loss with T2 x Fn/0.2 {-e['loss25']:.2f}% in 3.2-3.6% and scope holds: "
       f"{3.2 <= -e['loss25'] <= 3.6 and e['scope']}")


if __name__ == "__main__":
    main()
