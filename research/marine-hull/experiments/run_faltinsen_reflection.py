"""Milestone 7zh: STAWAVE-2's beam-based reflection term replaced by Faltinsen et al. (1980)'s waterline-shape term.

    PYTHONPATH=src:experiments python3 experiments/run_faltinsen_reflection.py > experiments/results_faltinsen_reflection.txt

7zg fitted heave and pitch damping to Kashiwagi (2022) Fig. 2's motions alone (zeta3 0.0375, zeta5 0) and found strip
plus STAWAVE-2 reflection 1.134 of Fig. 3's measured mean added-resistance area. Here the damping is kept, nothing is
refitted to Fig. 3, and the reflection term is swapped for Faltinsen's short-wave asymptotic formula computed from the
hull's own waterline (`marine_hull.reflection`). Then the same swap on the 4 m monohull (30 W loss, 200 W scope).

Expectations (committed to LOG.md before the first run, 1f757c165): F1 strip+Faltinsen at lambda/L 0.3-0.6 is
0.5-0.9 of the measured mean; F2 its area on 0.3-2.0 is 0.92-1.02; F3 its sigma rms is below strip+STAWAVE-2's;
F4 over the four variants the area ratio is in 0.90-1.05; F5 monohull 30 W loss (share 0.25) 3.3-4.1% and below
4.18%; F6 200 W scope holds; F7 with the A35 = A53 = 0 rule's motion fit the area ratio is in 0.92-1.02.
"""
import math
import sys
import time

from marine_hull import reflection as rf
from marine_hull import strip as st
from marine_hull import waves as wv
import run_a0_coupling_transfer as a0
import run_hotel_ranking as hr
import run_motion_damping_holdout as md
import run_range_speed as rr
import run_wave_added_resistance as rw
import run_wigley_seakeeping_tank as wt

L, B, D, RHO = wt.L, wt.B, wt.D, wt.RHO
FITS = (("plain", False, 0.0375, 0.0), ("A0", True, 0.0, 0.0))   # 7zg's motion fits
VARIANTS = (("kT, speed", 1.0, True), ("1.5kT, speed", 1.5, True), ("kT, no speed", 1.0, False),
            ("1.5kT, no speed", 1.5, False))
MAIN = VARIANTS[0]


def sigma_curve(h, lams, refl):
    """[(lambda/L, (strip, stawave_refl, other_refl))] on the tank hull, sigma units."""
    p = wt.Predict(h)
    out = []
    for x in lams:
        q = p.at(x)
        w = math.sqrt(2.0 * math.pi / (x * L) * st.G)
        out.append((x, (q["strip"], q["refl"], refl(w, p.u) / p.norm)))
    return out


def ratio(curve, mean, lo, hi, pick):
    c = [(x, pick(v)) for x, v in curve if lo - 1e-9 <= x <= hi + 1e-9]
    m = [(x, v) for x, v in mean if lo - 1e-9 <= x <= hi + 1e-9]
    return wt.trap(c) / wt.trap(m)


class FaltinsenWaveTable:
    """7y's WaveTable shape: (strip motion term, Faltinsen reflection term) per speed and T01."""

    def __init__(self, hull, speeds, t01s, integral, draft_arg=1.0, speed=True, omegas=wv.OMEGAS):
        self.speeds = speeds
        raos = [[hull.response(w, u)[2] for w in omegas] for u in speeds]
        refl = [[rf.rao(w, u, integral, hull.t, draft_arg=draft_arg, speed=speed) for w in omegas] for u in speeds]
        self.f = {}
        for t01 in sorted(set(t01s)):
            s = [wv.ittc_spectrum(w, 1.0, t01) for w in omegas]
            self.f[t01] = [(2.0 * wv.trap([r * x for r, x in zip(ra, s)], omegas),
                            2.0 * wv.trap([r * x for r, x in zip(rr_, s)], omegas)) for ra, rr_ in zip(raos, refl)]

    mean = rw.WaveTable.mean


def mono_eval(m, table):
    sp, rp = table.mean(m.recs)
    i1 = rr.DISP.index(1.0)
    loss = {}
    for s in rw.SHARES:
        az = hr.peak_at(rr.DISP, rw.add(m.calm_res, rw.tot((sp, rp)), s), 30.0)
        loss[s] = 100 * (az[0] / m.calm[0] - 1)
    ok = True
    for hl in (None, 1.0):
        sub = [r for r in m.recs if hl is None or r[1] <= hl]
        pt = table.mean(sub)
        mres = rw.add(m.calm_res, rw.tot(pt), 0.25)
        mb = rw.add(m.k25, rw.tot(pt), 0.25)
        mk = [hr.peak_at(rr.DISP, mb, x)[0] for x in hr.HOTELS]
        below = 0
        for c in m.box:
            x = hr.crossing(hr.HOTELS, [hr.peak_at(rr.FAST, c, h_)[0] / v for h_, v in zip(hr.HOTELS, mk)])
            below += x is not None and x <= hr.SOURCED_BAND
        lead = all(hr.peak_at(m.foil_sp, m.foil0, x)[0] <= hr.peak_at(rr.DISP, mres, x)[0]
                   for x in hr.HOTELS if x <= hr.SOURCED_BAND)
        ok = ok and lead and below == 0
    return dict(motion=sp[i1], refl=rp[i1], loss25=loss[0.25], loss1=loss[1.0], scope=ok)


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    data = wt.read_data()
    table = st.ModifiedWigleyStrip(L, B, D).table
    mean = wt.by_lambda([p for s in wt.SERIES for p in data[s]])
    lams = [x for x, _ in mean]
    i_tank = rf.waterline_integral(rf.modified_wigley_slope(L, B), L)
    pr(f"tank hull: modified Wigley L {L:g} m B {B:g} m d {D:g} m, Fn {wt.FN}; Faltinsen waterline integral "
       f"I = {i_tank:.5f} m (I/B {i_tank / B:.4f}; a transverse wall gives I/B 1)")
    # analytic check: for b = B/2 (1 - xi^2), I = 2 int_0^{L/2} s^3/(1+s^2) dx with s = 4Bx/L^2: closed form
    lw, bw = 4.0, 0.4
    s1 = 2.0 * bw / lw
    exact = 2.0 * (lw * lw / (4.0 * bw)) * (0.5 * s1 * s1 - 0.5 * math.log(1.0 + s1 * s1))
    num = rf.waterline_integral(rf.wigley_slope(lw, bw), lw)
    pr(f"check: parabolic Wigley L 4 B 0.4: I numeric {num:.6f}, closed form {exact:.6f} (rel {abs(num / exact - 1):.1e})")
    pr(f"measured mean area (0.3-2.0) {wt.trap(mean):.3f}; short waves (0.3-0.6) "
       f"{wt.trap([(x, v) for x, v in mean if x <= 0.6 + 1e-9]):.3f}")

    res = {}
    for name, rule, z3, z5 in FITS:
        h = st.ModifiedWigleyStrip(L, B, D, table=table, no_added_mass_coupling=rule)
        h.set_viscous(z3, z5)
        pr(f"## A. tank hull, coupling {name}, 7zg motion fit zeta3 {z3:.4f} zeta5 {z5:.4f}")
        pr("# table: variant area_0.3-2.0 short_0.3-0.6 sigma_rms peak_sigma peak_lambda " +
           " ".join(f"area_{s}" for s in wt.SERIES))
        for tag, darg, spd in (("strip alone", None, None), ("strip+STAWAVE-2 refl", None, None)) + VARIANTS:
            if darg is None:
                curve = sigma_curve(h, lams, lambda w, u: 0.0)
                pick = (lambda v: v[0]) if tag == "strip alone" else (lambda v: v[0] + v[1])
                fine_refl = lambda w, u: 0.0
            else:
                fn = (lambda d_, s_: lambda w, u: rf.rao(w, u, i_tank, D, rho=RHO, draft_arg=d_, speed=s_))(darg, spd)
                curve = sigma_curve(h, lams, fn)
                pick = lambda v: v[0] + v[2]
                fine_refl = fn
            a = ratio(curve, mean, 0.3, 2.0, pick)
            sh = ratio(curve, mean, 0.3, 0.6, pick)
            rms = a0.rms([pick(v) - m for (_, v), (_, m) in zip(curve, mean)])
            per = []
            for s in wt.SERIES:
                ms = wt.by_lambda(data[s])
                cs = sigma_curve(h, [x for x, _ in ms], fine_refl)
                per.append(wt.trap([(x, pick(v)) for x, v in cs]) / wt.trap(ms))
            fine = sigma_curve(h, [0.30 + 0.01 * i for i in range(171)], fine_refl)
            xb, vb = max(((x, pick(v)) for x, v in fine), key=lambda c: c[1])
            pr(f"row {tag.replace(' ', '_')} {a:.3f} {sh:.3f} {rms:.3f} {vb:.2f} {xb:.2f} " + " ".join(f"{q:.2f}" for q in per))
            res[(name, tag)] = dict(area=a, short=sh, rms=rms)
        pr("short-wave detail (lambda/L, measured mean, strip, STAWAVE-2 refl, Faltinsen refl main):")
        curve = sigma_curve(h, lams, lambda w, u: rf.rao(w, u, i_tank, D, rho=RHO, draft_arg=MAIN[1], speed=MAIN[2]))
        for (x, v), (_, m) in zip(curve, mean):
            if x <= 0.8 + 1e-9:
                pr(f"  {x:.2f} {m:.3f} {v[0]:.3f} {v[1]:.3f} {v[2]:.3f}")

    pr("## B. carried to the 4 m monohull (plain coupling, 7zg motion fit)")
    mono = a0.Mono()
    i_mono = rf.waterline_integral(rf.wigley_slope(mono.l, mono.b), mono.l)
    pr(f"monohull L {mono.l:g} B {mono.b:.3f} T {mono.t:.3f}: I/B {i_mono / mono.b:.4f}; calm 30 W range "
       f"{mono.calm[0]:.1f} km at {mono.calm[1]:.2f} m/s")
    hull = st.WigleyStrip(mono.l, mono.b, mono.t, table=mono.table)
    hull.set_viscous(0.0375, 0.0)
    pr("# table: reflection pooled_1ms_motion_N pooled_1ms_refl_N loss30W_share025 loss30W_share1 scope200W")
    import run_strip_added_resistance as rs
    rows = {}
    e = mono_eval(mono, rs.StripWaveTable(hull, rr.DISP, mono.t01s))
    rows["STAWAVE-2"] = e
    pr(f"row STAWAVE-2 {e['motion']:.3f} {e['refl']:.3f} {e['loss25']:.2f} {e['loss1']:.2f} {e['scope']}")
    for tag, darg, spd in VARIANTS:
        e = mono_eval(mono, FaltinsenWaveTable(hull, rr.DISP, mono.t01s, i_mono, darg, spd))
        rows[tag] = e
        pr(f"row Faltinsen_{tag.replace(' ', '_').replace(',', '')} {e['motion']:.3f} {e['refl']:.3f} "
           f"{e['loss25']:.2f} {e['loss1']:.2f} {e['scope']}")

    pr("## expectations")
    mp = res[("plain", MAIN[0])]
    pr(f"F1 short-wave ratio {mp['short']:.3f} in 0.5-0.9: {0.5 <= mp['short'] <= 0.9}")
    pr(f"F2 area ratio {mp['area']:.3f} in 0.92-1.02: {0.92 <= mp['area'] <= 1.02}")
    sw = res[("plain", "strip+STAWAVE-2 refl")]
    pr(f"F3 sigma rms {mp['rms']:.3f} < strip+STAWAVE-2 {sw['rms']:.3f}: {mp['rms'] < sw['rms']}")
    va = [res[("plain", v[0])]["area"] for v in VARIANTS]
    pr(f"F4 variant area ratios {min(va):.3f}-{max(va):.3f} in 0.90-1.05: {0.90 <= min(va) and max(va) <= 1.05}")
    lm = abs(rows[MAIN[0]]["loss25"])
    pr(f"F5 monohull 30 W loss {lm:.2f}% in 3.3-4.1 and < 4.18: {3.3 <= lm <= 4.1 and lm < 4.18}")
    pr(f"F6 200 W scope holds in every row: {all(r['scope'] for r in rows.values())}")
    ma = res[("A0", MAIN[0])]["area"]
    pr(f"F7 rule area ratio {ma:.3f} in 0.92-1.02: {0.92 <= ma <= 1.02}")
    print(f"runtime {time.time() - t0:.0f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
