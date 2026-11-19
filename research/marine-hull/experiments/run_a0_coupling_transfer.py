"""Milestone 7zf: 7ze's A35 = A53 = 0 rule carried to 7zd's measured-damping fit and the monohull's 30 W wave loss.

    PYTHONPATH=src:experiments python3 experiments/run_a0_coupling_transfer.py > experiments/results_a0_coupling_transfer.txt

7ze found that strip theory's heave overshoot at resonance on Kashiwagi's slender modified Wigley (Fn 0.2) is
carried by the speed-induced added-mass coupling A35, which the forced-oscillation measurement puts near zero, and
that dropping A35 and A53 (keeping the damping coupling) gives the best heave of any method. 7zd fitted the viscous
damping fraction zeta to the measured added-resistance area with the coupling as is. Here sections B to D of 7zd
are rerun with `no_added_mass_coupling=True` on both the tank hull and the 4 m monohull, next to the plain coupling
(rule off) for an in-run baseline.

Expectations (committed to LOG.md before the first run, 5e183a575): H1 rule: strip+refl area ratio at zeta 0 in
1.05-1.19, fitted zeta in (0, 0.025); H2 monohull pooled 1 m/s motion term at zeta 0 within 10% of 2.95 N;
H3 30 W loss (share 0.25) at the fitted zeta in 3.1-4.3% and within 0.5 points of 3.69%; H4 sigma rms against the
measured mean at the fitted zeta under 7zd's at zeta 0.025; H5 heave rms over lambda/L 0.8-2.0 at the fitted zeta
<= 0.140; H6 200 W scope holds; H7 with the refitted f_r the loss is within 0.5 points of 3.65%.
"""
import math
import sys
import time

from marine_hull import strip as st
import run_air_drag as ad
import run_hotel_ranking as hr
import run_michell as rm
import run_range_speed as rr
import run_strip_added_resistance as rs
import run_wave_added_resistance as rw
import run_wigley_seakeeping_tank as wt

L, B, D = wt.L, wt.B, wt.D
RULES = (("plain", False), ("A0", True))


def tank_hull(table, z, rule):
    return st.ModifiedWigleyStrip(L, B, D, table=table, zeta_v=z, no_added_mass_coupling=rule)


def bisect(f, lo=0.0, hi=0.4, n=40):
    """Smallest zeta in [lo, hi] with f(zeta) <= 1 (f decreasing), or 0 if f(0) <= 1."""
    if f(lo) <= 1.0:
        return lo
    for _ in range(n):
        mid = 0.5 * (lo + hi)
        if f(mid) > 1.0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def rms(xs):
    return math.sqrt(sum(x * x for x in xs) / len(xs))


class Mono:
    """The 4 m monohull of 7z-7zd in the pooled bow-sector wave climate: 30 W loss and the 200 W scope."""

    def __init__(self):
        self.recs = rw.read_waves()
        self.l, self.b, self.t = rm.hull(4.0, 1)[:3]
        self.table = st.WigleyStrip(self.l, self.b, self.t).table
        self.t01s = [rw.t01_of(r, "apd") for r in self.recs]
        self.wp = rw.WaveTable(rr.DISP, 1, self.t01s).mean(self.recs)
        self.calm_res, rungs0 = ad.base_rungs()
        rung = {nm: (s_, r_) for nm, s_, r_ in rungs0}
        self.foil_sp, self.foil0 = rung["hydrofoil"]
        self.calm = hr.peak_at(rr.DISP, self.calm_res, 30.0)
        self.box = rw.foil_box()
        self.k25 = rr.michell_r(4.0, 1, 0.0, 0.25, 0.0, rr.DISP)

    def eval(self, z, rule, refl_scale=1.0):
        mono = st.WigleyStrip(self.l, self.b, self.t, table=self.table, zeta_v=z, no_added_mass_coupling=rule)
        strip_t = rs.StripWaveTable(mono, rr.DISP, self.t01s)
        if refl_scale != 1.0:
            strip_t.f = {k: [(m, refl_scale * r) for m, r in v] for k, v in strip_t.f.items()}
        sp, rp = strip_t.mean(self.recs)
        i1 = rr.DISP.index(1.0)
        loss = {}
        for s in rw.SHARES:
            az = hr.peak_at(rr.DISP, rw.add(self.calm_res, rw.tot((sp, rp)), s), 30.0)
            loss[s] = 100 * (az[0] / self.calm[0] - 1)
        ok = True
        for hl in (None, 1.0):
            sub = [r for r in self.recs if hl is None or r[1] <= hl]
            pt = strip_t.mean(sub)
            mres = rw.add(self.calm_res, rw.tot(pt), 0.25)
            mb = rw.add(self.k25, rw.tot(pt), 0.25)
            mk = [hr.peak_at(rr.DISP, mb, x)[0] for x in hr.HOTELS]
            below = 0
            for c in self.box:
                x = hr.crossing(hr.HOTELS, [hr.peak_at(rr.FAST, c, h_)[0] / m for h_, m in zip(hr.HOTELS, mk)])
                below += x is not None and x <= hr.SOURCED_BAND
            lead = all(hr.peak_at(self.foil_sp, self.foil0, x)[0] <= hr.peak_at(rr.DISP, mres, x)[0]
                       for x in hr.HOTELS if x <= hr.SOURCED_BAND)
            ok = ok and lead and below == 0
        return dict(motion=sp[i1], ratio=sp[i1] / self.wp[0][i1], refl=rp[i1], loss25=loss[0.25], loss1=loss[1.0], scope=ok)


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    data = wt.read_data()
    base = st.ModifiedWigleyStrip(L, B, D)
    table = base.table
    allpts = [p for s in wt.SERIES for p in data[s]]
    mean = wt.by_lambda(allpts)
    lams = [x for x, _ in mean]
    am = wt.trap(mean)
    short = [(x, v) for x, v in mean if x <= 0.6 + 1e-9]
    k = lambda x: 2.0 * math.pi / (x * L)
    pr(f"tank hull: modified Wigley L {L:g} m B {B:g} m d {D:g} m, Fn {wt.FN}; measured mean area {am:.3f} "
       f"on {len(lams)} lambdas (0.30-2.00); rule A0 = no heave-pitch added-mass coupling (A35 = A53 = 0)")

    def curves(pred, fr=1.0):
        P = {x: pred.at(x) for x in lams}
        sp = [(x, P[x]["strip"] + fr * P[x]["refl"]) for x in lams]
        return P, sp

    def motions_rms(h):
        u = wt.FN * math.sqrt(st.G * L)
        out_ = {}
        for q, lo, hi in (("heave", 0.8, 2.0), ("pitch", 0.8, 2.0)):
            errs = []
            for x, v in sorted(data[q]):
                if lo <= x <= hi + 1e-9:
                    z, th, _, _ = h.response(math.sqrt(k(x) * st.G), u)
                    p = abs(z) if q == "heave" else abs(th) / k(x)
                    errs.append(p - v)
            out_[q] = rms(errs)
        lo13 = [(x, v) for x, v in sorted(data["heave"]) if 1.0 <= x <= 1.3 + 1e-9]
        out_["heave_res"] = sum(abs(h.response(math.sqrt(k(x) * st.G), u)[0]) / v - 1 for x, v in lo13) / len(lo13)
        return out_

    fine = [0.30 + 0.01 * i for i in range(171)]
    res = {}
    for name, rule in RULES:
        pr(f"## B/C. tank hull, coupling {name}")
        h0 = tank_hull(table, 0.0, rule)
        P0, sp0 = curves(wt.Predict(h0))
        a0 = wt.trap(sp0)
        ss = sum(P0[x]["strip"] for x, _ in short) / len(short)
        ms = sum(v for _, v in short) / len(short)
        pr(f"zeta 0: strip area {wt.trap([(x, P0[x]['strip']) for x in lams]) / am:.3f} of measured mean; "
           f"strip+refl {a0 / am:.3f}; short-wave strip {ss / ms:.2f} of measured")

        def ratio(z, target, xs, fr=1.0):
            pp = wt.Predict(tank_hull(table, z, rule))
            return wt.trap([(x, (lambda p: p["strip"] + fr * p["refl"])(pp.at(x))) for x in xs]) / target

        zf = bisect(lambda z: ratio(z, am, lams))
        per = {}
        for s in wt.SERIES:
            c = wt.by_lambda(data[s])
            per[s] = bisect(lambda z: ratio(z, wt.trap(c), [x for x, _ in c]))
        pr(f"fitted zeta (mean): {zf:.4f}; per series " + ", ".join(f"{s} {z:.3f}" for s, z in per.items()))
        hf = tank_hull(table, zf, rule)
        pf = wt.Predict(hf)
        Pf, spf = curves(pf)
        e = rms([v2 - v for (_, v2), (_, v) in zip(spf, mean)])
        cf = [(x, (lambda p: p["strip"] + p["refl"])(pf.at(x))) for x in fine]
        xb, vb = max(cf, key=lambda c: c[1])
        m = motions_rms(hf)
        m0 = motions_rms(h0)
        pr(f"at fitted zeta: strip+refl peak {vb:.2f} at lambda/L {xb:.2f}; sigma rms vs measured mean {e:.3f}; "
           f"heave rms (0.8-2.0) {m['heave']:.3f}, pitch rms {m['pitch']:.3f}, mean heave error at 1.0-1.3 "
           f"{100 * m['heave_res']:+.1f}%")
        pr(f"at zeta 0: heave rms {m0['heave']:.3f}, pitch rms {m0['pitch']:.3f}, mean heave error at 1.0-1.3 "
           f"{100 * m0['heave_res']:+.1f}%")
        # section D (7zd's post hoc, repeated): reflection scaled to the short-wave data, zeta refitted
        fr = sum(v - P0[x]["strip"] for x, v in short) / sum(P0[x]["refl"] for x, _ in short)
        zr = bisect(lambda z: ratio(z, am, lams, fr))
        pz = wt.Predict(tank_hull(table, zr, rule))
        er = rms([pz.at(x)["strip"] + fr * pz.at(x)["refl"] - v for x, v in mean])
        pr(f"D: reflection scale f_r {fr:.3f}, refitted zeta {zr:.4f}, sigma rms vs measured mean {er:.3f}")
        res[name] = dict(a0=a0 / am, zf=zf, per=per, e=e, heave=m["heave"], fr=fr, zr=zr, er=er, peak=(vb, xb))

    pr("## C/D. carried to the 4 m monohull (30 W range loss, 200 W scope)")
    mono = Mono()
    pr(f"reference: calm 30 W range {mono.calm[0]:.1f} km at {mono.calm[1]:.2f} m/s")
    pr("# table: case coupling zeta f_r pooled_1ms_motion_N ratio_to_stawave2 pooled_1ms_reflection_N loss30W_share025 loss30W_share1 scope200W")
    rows = {}
    cases = [("zeta0", n, r, 0.0, 1.0) for n, r in RULES]
    cases += [("fit", n, r, res[n]["zf"], 1.0) for n, r in RULES]
    cases += [("fit_scaled", n, r, res[n]["zr"], res[n]["fr"]) for n, r in RULES]
    for n, r in RULES:
        zs = sorted(set(round(z, 3) for z in res[n]["per"].values()))
        cases += [(f"series_{z:.3f}", n, r, z, 1.0) for z in zs]
    for case, n, r, z, fr in cases:
        e = mono.eval(z, r, fr)
        rows[(case, n)] = e
        pr(f"row {case} {n} {z:.4f} {fr:.3f} {e['motion']:.3f} {e['ratio']:.2f} {e['refl']:.3f} "
           f"{e['loss25']:.2f} {e['loss1']:.2f} {e['scope']}")
    ser = [rows[k_]["loss25"] for k_ in rows if k_[0].startswith("series_") and k_[1] == "A0"]
    pr(f"A0 per-series 30 W loss range (share 0.25): {min(ser):.2f}% to {max(ser):.2f}%")

    pr("## expectations")
    p, a = res["plain"], res["A0"]
    h1 = 1.05 <= a["a0"] <= 1.19 and 0.0 < a["zf"] < 0.025
    pr(f"H1 A0 strip+refl area ratio at zeta 0 {a['a0']:.3f} (1.05-1.19), fitted zeta {a['zf']:.4f} in (0, 0.025): {h1}")
    m0p, m0a = rows[("zeta0", "plain")]["motion"], rows[("zeta0", "A0")]["motion"]
    pr(f"H2 monohull motion term at zeta 0: plain {m0p:.3f} N, A0 {m0a:.3f} N ({100 * (m0a / m0p - 1):+.1f}%; within 10%): "
       f"{abs(m0a / m0p - 1) < 0.10}")
    lp, la = rows[("fit", "plain")]["loss25"], rows[("fit", "A0")]["loss25"]
    pr(f"H3 30 W loss at fitted zeta: plain {lp:.2f}%, A0 {la:.2f}% (|.| in 3.1-4.3 and within 0.5 of 3.69): "
       f"{3.1 <= abs(la) <= 4.3 and abs(abs(la) - 3.69) <= 0.5}")
    pr(f"H4 sigma rms at fitted zeta: plain {p['e']:.3f}, A0 {a['e']:.3f} (A0 lower): {a['e'] < p['e']}")
    pr(f"H5 A0 heave rms at fitted zeta {a['heave']:.3f} (<= 0.140): {a['heave'] <= 0.140 + 5e-4}")
    pr(f"H6 200 W scope holds in every row: {all(e['scope'] for e in rows.values())}")
    ls = rows[("fit_scaled", "A0")]["loss25"]
    pr(f"H7 A0 with refitted f_r: loss {ls:.2f}% (plain {rows[('fit_scaled', 'plain')]['loss25']:.2f}%; within 0.5 of 3.65): "
       f"{abs(abs(ls) - 3.65) <= 0.5}")
    print(f"runtime {time.time() - t0:.0f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
