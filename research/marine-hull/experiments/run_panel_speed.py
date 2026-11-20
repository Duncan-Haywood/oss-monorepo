"""Milestone 7zn: Capytaine's forward-speed (encounter-frequency) option against the tank at Fn 0.2 and on the monohull.

    PYTHONPATH=src:experiments python3 experiments/run_panel_speed.py > experiments/results_panel_speed.txt

Needs `capytaine` and `numpy` (`python3 platform/ci/pyenv.py capytaine numpy` from the repo root). Capytaine 3.0.0's
forward-speed option keeps the zero-speed free-surface Green function at the encounter frequency, adds the
uniform-stream m-terms -U d(dof)/dx . n to the radiation condition and integrates rho (i omega_e phi + U dphi/dx); it is
an approximation (no steady flow, no forward-speed free-surface condition) and is labelled so in the output.

Sections: (S0) code checks; (S1) mesh; (A) heave-pitch cross-coupling against Kashiwagi et al.'s forced-oscillation
data (Kashiwagi 2022, Fig. 1); (B) heave and pitch against Fig. 2; (C) added resistance against Fig. 3; (D) Journee's
L/B 10 Wigley I and III peaks at Fn 0.2 and the heave point at Fn 0.3 (second-hand, as 7zk); (E) the 4 m monohull.

Expectations (committed to LOG.md before the full run, 7265b670d): S0 U 1e-5 reproduces zero speed to 1e-4 and GB with
strip motions reproduces strip.response to 1e-9; S1 mesh moves tank heave and pitch by < 2%; S2 panel beats strip on
B35 and B53 (KL >= 3 rms), not on A35, A53 median positive; S3 panel heave rms on 0.8-2.0 above strip's and mean heave
error on 1.0-1.3 above +15%; S4 tank GB area panel/strip on 0.5-2.0 above 1.2; S5 strip motions reproduce 7zh's area
ratio, panel motions above 1.1; S6 Journee Fn 0.2 panel peak ratio above strip's on both hulls and in 0.85-1.25 on
both; S7 Journee I heave at Fn 0.3, lambda/L 1.25 within 15% of 2.52; S8 monohull motion-term ratio at 1 m/s above
1.15, 30 W loss (share 0.25) in 3.6-4.8%, 200 W scope holds.
"""
import math
import sys
import time

from marine_hull import panel as pn
from marine_hull import reflection as rf
from marine_hull import strip as st
from marine_hull import waves as wv
import run_kashiwagi_baselines as kb
import run_wigley_seakeeping_tank as wt

G = st.G
L, B, D, RHO, FN = wt.L, wt.B, wt.D, wt.RHO, wt.FN
DAMP = (("7zg", 0.0375, 0.0), ("zeta 0", 0.0, 0.0))
TANK_FINE = [round(0.30 + 0.05 * i, 2) for i in range(35)]          # 0.30 .. 2.00


def pr(*a):
    print(*a)
    sys.stdout.flush()


def rms(e):
    return math.sqrt(sum(x * x for x in e) / len(e)) if e else float("nan")


def omega_of(lam, length):
    return math.sqrt(2.0 * math.pi * G / (lam * length))


def omega_from_we(we, u):
    """Absolute head-wave frequency whose encounter frequency is we: omega + U omega^2 / g = we."""
    if u == 0:
        return we
    return (-1.0 + math.sqrt(1.0 + 4.0 * u * we / G)) / (2.0 * u / G)


class Pair:
    """A strip hull and its panel twin at one speed, with cached panel solves."""

    def __init__(self, h, p, u):
        self.h, self.p, self.u = h, p, u
        self.c33, self.c55 = h.restoring()
        self.c35 = pn.strip_coupling_restoring(h)
        self.cache = {}

    def q(self, w):
        key = round(w, 10)
        if key not in self.cache:
            self.cache[key] = self.p.at_speed(w, self.u)
        return self.cache[key]

    def at(self, w, bv=None):
        """strip (z, th, raw) and panel (z, th, raw) in the strip convention, with the hull's viscous damping."""
        bv33, bv55 = (self.h.bv33, self.h.bv55) if bv is None else bv
        zs, ts, raw_s, _ = self.h.response(w, self.u)
        zp, tp = pn.to_strip(*pn.motions_speed(self.q(w), self.h.mass, self.h.iyy, self.c33, self.c55, self.c35,
                                               bv33, bv55))
        raw_p = pn.gb_added_resistance_speed(self.h, w, self.u, zp, tp)
        return (zs, ts, raw_s), (zp, tp, raw_p)


def area(curve, lo, hi):
    c = [(x, v) for x, v in curve if lo - 1e-9 <= x <= hi + 1e-9]
    return wt.trap(c)


def code_checks(pair):
    pr("== S0 code checks ==")
    w = omega_of(1.1, L)
    q0, q1 = pair.p.at(w), pair.p.at_speed(w, 1e-5)
    rel = max(abs(q1["A"][0][0] / q0["A33"] - 1), abs(q1["B"][0][0] / q0["B33"] - 1), abs(q1["A"][1][1] / q0["A55"] - 1),
              abs(q1["B"][1][1] / q0["B55"] - 1), abs(q1["F3"] / q0["F3"] - 1), abs(q1["F5"] / q0["F5"] - 1))
    gbd = 0.0
    for lam in (0.5, 1.0, 1.5):
        ww = omega_of(lam, L)
        zs, ts, raw, _ = pair.h.response(ww, pair.u)
        gbd = max(gbd, abs(pn.gb_added_resistance_speed(pair.h, ww, pair.u, zs, ts) / raw - 1))
    pr(f"U 1e-5 vs zero speed, lambda/L 1.1: largest relative difference in A33 B33 A55 B55 F3 F5 {rel:.1e}")
    pr(f"GB with strip motions vs strip.response at Fn {FN}: largest relative difference {gbd:.1e}")
    return rel, gbd


def mesh_check(h, u, coarse):
    pr("== S1 mesh: 40x8 vs 80x16 per half, tank hull, Fn 0.2, 7zg damping ==")
    fine = Pair(h, pn.PanelHullSpeed(L, B, D, rho=RHO, modified=True, nx=80, nz=16), u)
    worst = 0.0
    for lam in (0.6, 0.8, 1.0, 1.1, 1.2, 1.4, 1.7, 2.0):
        w = omega_of(lam, L)
        k = w * w / G
        _, (zc, tc, _) = coarse.at(w)
        _, (zf, tf, _) = fine.at(w)
        dz, dt = abs(zc) / abs(zf) - 1, abs(tc) / abs(tf) - 1
        worst = max(worst, abs(dz), abs(dt))
        pr(f"  lambda/L {lam:.2f}: heave {abs(zc):.4f} / {abs(zf):.4f} ({100 * dz:+.2f}%), pitch/k {abs(tc) / k:.4f} / "
           f"{abs(tf) / k:.4f} ({100 * dt:+.2f}%)")
    pr(f"S1 largest change {100 * worst:.2f}% ({coarse.p.n_panels} -> {fine.p.n_panels} hull panels)")
    return worst


def coupling(pair):
    pr("== A. heave-pitch cross-coupling against Kashiwagi (2022) Fig. 1 measured (bow-down pitch) ==")
    cur = kb.read_curves()
    nd_a = RHO * pair.h.vol * L
    nd_b = nd_a * math.sqrt(G / L)
    idx = {"A35": ("A", 0, 1), "B35": ("B", 0, 1), "A53": ("A", 1, 0), "B53": ("B", 1, 0)}

    def panel_nd(kl):
        we = math.sqrt(kl * G / L)
        q = pair.q(omega_from_we(we, pair.u))
        return {c: q[m][i][j] / (nd_a if m == "A" else nd_b) for c, (m, i, j) in idx.items()}, q["we"] / we - 1

    def strip_nd(kl):
        we = math.sqrt(kl * G / L)
        a35, b35, a53, b53 = pair.h.cross_coupling(we, pair.u)
        return dict(A35=a35 / nd_a, B35=b35 / nd_b, A53=a53 / nd_a, B53=b53 / nd_b)

    pr("# table: KL panel_A35 panel_B35 panel_A53 panel_B53 strip_A35 strip_B35 strip_A53 strip_B53")
    werr = 0.0
    for kl in (1, 2, 3, 5, 7.5, 10, 15, 20, 25):
        pv, e = panel_nd(kl)
        werr = max(werr, abs(e))
        sv = strip_nd(kl)
        pr(f"row {kl:g} " + " ".join(f"{pv[c]:+.4f}" for c in kb.COEFS) + " " + " ".join(f"{sv[c]:+.4f}" for c in kb.COEFS))
    pr(f"check: encounter frequency recovered to {werr:.1e}")
    out = {}
    for c in kb.COEFS:
        m = [(x, y) for x, y in kb.smooth_measured(cur[(c, "experiment")]) if x >= 3]
        ep = [panel_nd(x)[0][c] - y for x, y in m]
        es = [strip_nd(x)[c] - y for x, y in m]
        eu = [kb.interp(cur[(c, "modified EUT")], x) for x, _ in m]
        eu = [v - y for v, (_, y) in zip(eu, m) if v is not None]
        med_m = sorted(y for _, y in m)[len(m) // 2]
        med_p = sorted(panel_nd(x)[0][c] for x, _ in m)[len(m) // 2]
        out[c] = dict(panel=rms(ep), strip=rms(es), meut=rms(eu), med_m=med_m, med_p=med_p)
        pr(f"{c}: n {len(m)} (KL >= 3); measured median {med_m:+.4f}, panel median {med_p:+.4f}; rms error panel "
           f"{rms(ep):.4f}, strip {rms(es):.4f}, modified EUT {rms(eu):.4f} (n {len(eu)})")
    return out


def tank(pair):
    data = wt.read_data()
    mean = wt.by_lambda([q for s in wt.SERIES for q in data[s]])
    i_tank = rf.waterline_integral(rf.modified_wigley_slope(L, B), L)
    norm = RHO * G * B * B / L
    refl = lambda w: rf.rao(w, pair.u, i_tank, D, rho=RHO, draft_arg=1.0, speed=True) / norm
    res = {}
    for dname, z3, z5 in DAMP:
        pair.h.set_viscous(z3, z5)
        pr(f"== B. motions against Fig. 2, damping {dname} (zeta3 {z3}, zeta5 {z5}) ==")
        for qn in ("heave", "pitch"):
            pts = sorted(data[qn])
            es, ep, ms, mp = [], [], [], []
            line = []
            for x, v in pts:
                if not 0.8 - 1e-9 <= x <= 2.0 + 1e-9:
                    continue
                w = omega_of(x, L)
                k = w * w / G
                (zs, ts, _), (zp, tp, _) = pair.at(w)
                s_, p_ = (abs(zs), abs(zp)) if qn == "heave" else (abs(ts) / k, abs(tp) / k)
                es.append(s_ - v)
                ep.append(p_ - v)
                if 1.0 - 1e-9 <= x <= 1.3 + 1e-9:
                    ms.append(s_ / v - 1)
                    mp.append(p_ / v - 1)
                line.append(f"{x:.2f}:{v:.3f}/{s_:.3f}/{p_:.3f}")
            res[(dname, qn)] = dict(strip=rms(es), panel=rms(ep), mid_s=sum(ms) / len(ms), mid_p=sum(mp) / len(mp))
            pr(f"{qn}: rms on 0.8-2.0 strip {rms(es):.3f}, panel {rms(ep):.3f}; mean error on 1.0-1.3 strip "
               f"{100 * sum(ms) / len(ms):+.1f}%, panel {100 * sum(mp) / len(mp):+.1f}%")
            pr("  lambda/L:measured/strip/panel " + " ".join(line))
        pr(f"== C. added resistance against Fig. 3, damping {dname} ==")
        lams = [x for x, _ in mean]
        cs, cp = [], []
        for x in lams:
            w = omega_of(x, L)
            (_, _, rs_), (_, _, rp_) = pair.at(w)
            r = refl(w)
            cs.append((x, rs_ / norm + r))
            cp.append((x, rp_ / norm + r))
        a_meas = area(mean, 0.3, 2.0)
        a_s, a_p = area(cs, 0.3, 2.0) / a_meas, area(cp, 0.3, 2.0) / a_meas
        fine_s, fine_p = [], []
        for x in TANK_FINE:
            w = omega_of(x, L)
            (_, _, rs_), (_, _, rp_) = pair.at(w)
            fine_s.append((x, rs_ / norm))
            fine_p.append((x, rp_ / norm))
        gb = area(fine_p, 0.5, 2.0) / area(fine_s, 0.5, 2.0)
        pks, pkp = max(fine_s, key=lambda c: c[1]), max(fine_p, key=lambda c: c[1])
        pkm = max(mean, key=lambda c: c[1])
        res[(dname, "sigma")] = dict(area_s=a_s, area_p=a_p, gb=gb)
        pr(f"strip+Faltinsen area over measured mean on 0.3-2.0: strip motions {a_s:.3f}, panel motions {a_p:.3f}; "
           f"sigma rms strip {rms([v - m for (_, v), (_, m) in zip(cs, mean)]):.3f}, panel "
           f"{rms([v - m for (_, v), (_, m) in zip(cp, mean)]):.3f}")
        pr(f"GB area on 0.5-2.0, panel motions / strip motions {gb:.3f}; GB peak strip {pks[1]:.2f} at {pks[0]:.2f}, "
           f"panel {pkp[1]:.2f} at {pkp[0]:.2f}; measured mean peak {pkm[1]:.2f} at {pkm[0]:.2f}")
        pr("# table: lambda_L measured_mean strip+refl panel+refl")
        for (x, m), (_, a), (_, b_) in zip(mean, cs, cp):
            pr(f"srow {x:.2f} {m:.3f} {a:.3f} {b_:.3f}")
    return res


# Journee (1992) peaks and heave point, as quoted second-hand (7zk, `run_journee_lb10.py`)
JL, JB, JD, JKYY = 3.0, 0.3, 0.1875, 0.25
J_MEAS = {"I": 31.8, "III": 22.2}
J_STRIP = {"I": 0.700, "III": 0.783}          # 7zk's strip ratios (7zg damping), reproduced below as a check


def journee():
    pr("== D. Journee (1992) L/B 10 Wigley I and III, Fn 0.2 peaks (second-hand) ==")
    i_j = rf.waterline_integral(rf.modified_wigley_slope(JL, JB), JL)
    norm = RHO * G * JB * JB / JL
    out = {}
    for name, alpha in (("I", 1.0), ("III", 0.0)):
        h = st.ModifiedWigleyStrip(JL, JB, JD, kyy=JKYY, rho=RHO, alpha=alpha)
        h.set_viscous(0.0375, 0.0)
        p = pn.PanelHullSpeed(JL, JB, JD, rho=RHO, modified=True, alpha=alpha)
        for fn in (0.2, 0.3):
            u = fn * math.sqrt(G * JL)
            pair = Pair(h, p, u)
            refl = lambda w: rf.rao(w, u, i_j, JD, rho=RHO) / norm
            if fn == 0.2:
                def sig(x):
                    w = omega_of(x, JL)
                    (_, _, rs_), (_, _, rp_) = pair.at(w)
                    r = refl(w)
                    return rs_ / norm + r, rp_ / norm + r
                coarse = {round(0.5 + 0.05 * i, 2): sig(0.5 + 0.05 * i) for i in range(31)}
                peaks = []
                for col in (0, 1):
                    x0 = max(coarse, key=lambda x: coarse[x][col])
                    best = max(((round(x0 + 0.01 * j, 2), sig(x0 + 0.01 * j)[col]) for j in range(-4, 5)),
                               key=lambda c: c[1])
                    peaks.append(best)
                (xs, vs), (xp, vp) = peaks
                out[name] = dict(strip=vs / J_MEAS[name], panel=vp / J_MEAS[name])
                pr(f"Wigley {name} (alpha {alpha:g}, {p.n_panels} panels): measured peak {J_MEAS[name]}; strip+Faltinsen "
                   f"{vs:.2f} at {xs:.2f} ({vs / J_MEAS[name]:.3f}; 7zk {J_STRIP[name]:.3f}); panel motions {vp:.2f} at "
                   f"{xp:.2f} ({vp / J_MEAS[name]:.3f})")
                pr("  coarse lambda/L:strip/panel " + " ".join(f"{x:.2f}:{a:.1f}/{b_:.1f}" for x, (a, b_) in coarse.items()))
            elif name == "I":
                w = omega_of(1.25, JL)
                (zs, _, _), (zp, _, _) = pair.at(w)
                h0 = (h.bv33, h.bv55)
                h.set_viscous(0.0, 0.0)
                (zs0, _, _), (zp0, _, _) = pair.at(w)
                h.bv33, h.bv55 = h0
                out["heave"] = dict(strip=abs(zs), panel=abs(zp), strip0=abs(zs0), panel0=abs(zp0))
                pr(f"Wigley I, Fn 0.3, lambda/L 1.25 heave (measured 2.52): 7zg damping strip {abs(zs):.3f}, panel "
                   f"{abs(zp):.3f} ({100 * (abs(zp) / 2.52 - 1):+.1f}%); zeta 0 strip {abs(zs0):.3f}, panel {abs(zp0):.3f}")
    return out


MONO_SPEEDS = (0.6, 1.0, 1.4)
MONO_OMEGAS = [0.8 * (9.0 / 0.8) ** (i / 39) for i in range(40)]


class PanelScaled:
    """The strip monohull with its GB motion term multiplied by the panel/strip ratio r(omega, U)."""

    def __init__(self, hull, ratios):
        self.h, self.t, self.r = hull, hull.t, ratios

    def ratio(self, w, u):
        us = MONO_SPEEDS
        u = min(max(u, us[0]), us[-1])
        j = 0 if u <= us[1] else 1
        f = (u - us[j]) / (us[j + 1] - us[j])
        return (1 - f) * self._r_w(j, w) + f * self._r_w(j + 1, w)

    def _r_w(self, j, w):
        ws, rs = MONO_OMEGAS, self.r[j]
        if w <= ws[0]:
            return rs[0]
        if w >= ws[-1]:
            return rs[-1]
        i = max(i for i in range(len(ws)) if ws[i] <= w)
        f = (w - ws[i]) / (ws[i + 1] - ws[i])
        return (1 - f) * rs[i] + f * rs[i + 1]

    def response(self, w, u):
        z, th, raw, we = self.h.response(w, u)
        return z, th, raw * self.ratio(w, u), we


def monohull():
    import run_a0_coupling_transfer as a0
    import run_faltinsen_reflection as fr
    import run_range_speed as rr
    pr("== E. the 4 m monohull (Wigley L/B 10, sea water), 7zg damping, Faltinsen reflection ==")
    mono = a0.Mono()
    hull = st.WigleyStrip(mono.l, mono.b, mono.t, table=mono.table)
    hull.set_viscous(0.0375, 0.0)
    p = pn.PanelHullSpeed(mono.l, mono.b, mono.t, rho=st.RHO)
    ratios = []
    pr("# table: U omega lambda_L GB_strip GB_panel ratio")
    for u in MONO_SPEEDS:
        pair = Pair(hull, p, u)
        rs = []
        for w in MONO_OMEGAS:
            (_, _, a), (_, _, b_) = pair.at(w)
            rs.append(b_ / a if a > 1e-12 else 1.0)
            pr(f"mrow {u:.1f} {w:.3f} {2 * math.pi * G / (w * w) / mono.l:.3f} {a:.4f} {b_:.4f} {rs[-1]:.3f}")
        ratios.append(rs)
    i_mono = rf.waterline_integral(rf.wigley_slope(mono.l, mono.b), mono.l)
    e0 = fr.mono_eval(mono, fr.FaltinsenWaveTable(hull, rr.DISP, mono.t01s, i_mono))
    e1 = fr.mono_eval(mono, fr.FaltinsenWaveTable(PanelScaled(hull, ratios), rr.DISP, mono.t01s, i_mono))
    pr("# table: motions pooled_1ms_motion_N pooled_1ms_refl_N loss30W_share025 loss30W_share1 scope200W")
    for tag, e in (("strip (7zh row)", e0), ("panel-scaled", e1)):
        pr(f"row {tag.replace(' ', '_')} {e['motion']:.3f} {e['refl']:.3f} {e['loss25']:.2f} {e['loss1']:.2f} {e['scope']}")
    return dict(ratio=e1["motion"] / e0["motion"], loss=abs(e1["loss25"]), scope=e1["scope"], base=abs(e0["loss25"]))


def main():
    t0 = time.time()
    import capytaine
    capytaine.set_logging("ERROR")
    pr("Milestone 7zn: strip theory against Capytaine's forward-speed approximation (encounter-frequency Green function, "
       "uniform-stream m-terms), head waves")
    pr(f"capytaine {capytaine.__version__}; quads cosine-spaced in x and z, one half mirrored, waterplane lid; 40x8 per half "
       "unless stated")
    u = FN * math.sqrt(G * L)
    h = st.ModifiedWigleyStrip(L, B, D)
    h.set_viscous(0.0375, 0.0)
    pair = Pair(h, pn.PanelHullSpeed(L, B, D, rho=RHO, modified=True), u)
    pr(f"tank hull: modified Wigley L {L} B {B} d {D}, Fn {FN} (U {u:.3f} m/s), {pair.p.n_panels} hull panels")
    rel, gbd = code_checks(pair)
    s1 = mesh_check(h, u, pair)
    cp = coupling(pair)
    tk = tank(pair)
    h.set_viscous(0.0375, 0.0)
    jn = journee()
    mo = monohull()

    pr("\n== expectations ==")
    ok = lambda c: "held" if c else "refuted"
    pr(f"S0 U->0 {rel:.1e} < 1e-4 and GB {gbd:.1e} < 1e-9 -> {ok(rel < 1e-4 and gbd < 1e-9)}")
    pr(f"S1 mesh {100 * s1:.2f}% < 2% -> {ok(s1 < 0.02)}")
    s2 = (cp["B35"]["panel"] < cp["B35"]["strip"] and cp["B53"]["panel"] < cp["B53"]["strip"]
          and cp["A35"]["panel"] >= cp["A35"]["strip"] and cp["A53"]["med_p"] > 0)
    pr("S2 rms panel/strip " + ", ".join(f"{c} {cp[c]['panel']:.4f}/{cp[c]['strip']:.4f}" for c in kb.COEFS) +
       f"; A53 panel median {cp['A53']['med_p']:+.4f} -> {ok(s2)}")
    hv = tk[("7zg", "heave")]
    s3 = hv["panel"] > hv["strip"] and hv["mid_p"] > 0.15
    pr(f"S3 heave rms panel {hv['panel']:.3f} vs strip {hv['strip']:.3f}; panel mean error 1.0-1.3 "
       f"{100 * hv['mid_p']:+.1f}% -> {ok(s3)}")
    sg = tk[("7zg", "sigma")]
    pr(f"S4 GB panel/strip {sg['gb']:.3f} > 1.2 -> {ok(sg['gb'] > 1.2)}")
    pr(f"S5 area strip {sg['area_s']:.3f} (7zh 0.929), panel {sg['area_p']:.3f} > 1.1 -> "
       f"{ok(abs(sg['area_s'] - 0.929) < 0.005 and sg['area_p'] > 1.1)}")
    s6 = all(jn[n]["panel"] > jn[n]["strip"] and 0.85 <= jn[n]["panel"] <= 1.25 for n in ("I", "III"))
    pr(f"S6 Journee ratios panel I {jn['I']['panel']:.3f}, III {jn['III']['panel']:.3f} (strip {jn['I']['strip']:.3f}, "
       f"{jn['III']['strip']:.3f}) -> {ok(s6)}")
    hz = jn["heave"]["panel"]
    pr(f"S7 heave {hz:.3f} within 15% of 2.52 -> {ok(abs(hz / 2.52 - 1) <= 0.15)}")
    s8 = mo["ratio"] > 1.15 and 3.6 <= mo["loss"] <= 4.8 and mo["scope"]
    pr(f"S8 monohull motion-term ratio {mo['ratio']:.3f}, 30 W loss {mo['loss']:.2f}% (strip {mo['base']:.2f}%), "
       f"scope {mo['scope']} -> {ok(s8)}")
    pr(f"\nrun time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
