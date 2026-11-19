"""Milestone 7ze: the in-house strip theory against the published state of the art on the Kashiwagi tank hull,
and a test of whether its heave overshoot comes from the heave-pitch cross-coupling.

    PYTHONPATH=src:experiments python3 experiments/run_kashiwagi_baselines.py > experiments/results_kashiwagi_baselines.txt

Data: Kashiwagi (2022), J. Ship Research 66(1) 1-14, doi:10.5957/JOSR.04200028, slender modified Wigley at Fn 0.2:
* measured heave, pitch, added resistance (Figs. 2, 3; 7zd's `data/kashiwagi2022_slender_wigley_fn020.csv`);
* measured cross-coupling A35, A53, B35, B53 from forced oscillation (Fig. 1) and the paper's four computed
  curves EUT, NSM, modified EUT, modified NSM in Figs. 1 to 3 (`data/kashiwagi2022_curves_fn020.csv`, read by
  `digitise_kashiwagi2022_curves.py`).

Methods: 7z/7zd strip theory (`strip.ModifiedWigleyStrip`), STAWAVE-2 (`waves.rao_parts`), and strip plus
STAWAVE-2's reflection term, as in 7zd. Part C replaces only the strip's heave-pitch cross-coupling added mass and
damping in the motion equations (`response(..., coupling=...)`).

Expectations (committed to LOG.md before the first run, commit 3ee5fe778):
E1 strip heave and pitch within 10% of the NSM curve at lambda/L 1.0-2.0, sigma peak within 15% of the NSM's;
E2 strip A35, A53, B35, B53 have the measured signs, within 20% of the NSM curve at KL 5-25, and rms error against
   measured larger than the modified EUT's for each;
E3 heave rms over lambda/L 0.8-2.0: modified EUT < modified NSM < strip <= 1.2 x NSM < EUT;
E4 with measured coupling the mean heave error at lambda/L 1.0-1.3 falls from +26% to under +10%;
E5 with measured coupling the sigma peak falls, moves to longer lambda/L, and stays in 9.2-13.2;
E6 over lambda/L 0.65-2.0 strip+reflection sigma rms under 1.5 x the best published curve's.
"""
import csv
import math
import os
import sys
import time
from collections import defaultdict

from marine_hull import strip as st
import run_wigley_seakeeping_tank as wt

HERE = os.path.dirname(os.path.abspath(__file__))
CURVES = os.path.join(HERE, "data", "kashiwagi2022_curves_fn020.csv")
L, B, D, RHO, FN = wt.L, wt.B, wt.D, wt.RHO, wt.FN
PUB = ["EUT", "NSM", "modified EUT", "modified NSM"]
COEFS = ["A35", "B35", "A53", "B53"]


def read_curves(path=CURVES):
    out = defaultdict(list)
    with open(path) as f:
        for r in csv.DictReader(f):
            out[(r["panel"], r["series"])].append((float(r["x"]), float(r["y"])))
    for k in out:
        out[k].sort()
    return out


def interp(curve, x, clamp=False):
    """Linear interpolation on a sorted [(x, y)]; None outside the range unless clamp."""
    if x < curve[0][0] or x > curve[-1][0]:
        if not clamp:
            return None
        return curve[0][1] if x < curve[0][0] else curve[-1][1]
    for (x0, y0), (x1, y1) in zip(curve, curve[1:]):
        if x0 <= x <= x1:
            return y0 if x1 == x0 else y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return curve[-1][1]


def smooth_measured(pts):
    """Repeated points at the same x (to 0.05 in KL) averaged, sorted."""
    g = defaultdict(list)
    for x, y in pts:
        g[round(x / 0.05) * 0.05].append((x, y))
    return sorted((sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)) for v in g.values())


def rms(errs):
    return math.sqrt(sum(e * e for e in errs) / len(errs)) if errs else float("nan")


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    meas = wt.read_data()
    cur = read_curves()
    hull = st.ModifiedWigleyStrip(L, B, D)
    pred = wt.Predict(hull)
    u = pred.u
    nd_a = RHO * hull.vol * L
    nd_b = nd_a * math.sqrt(st.G / L)
    pr(f"hull: modified Wigley L {L:g} m B {B:g} m d {D:g} m, volume {hull.vol:.5f} m3, Fn {FN} (U {u:.3f} m/s); "
       f"coefficients over rho V L = {nd_a:.2f} kg m and rho V L sqrt(g/L) = {nd_b:.2f} kg m/s; KL = omega_e^2 L / g")

    # ------------------------------------------------------------------ A. cross-coupling coefficients
    pr("## A. heave-pitch cross-coupling against Fig. 1 (bow-down pitch convention)")
    ours = {}

    def ours_nd(kl):
        if kl not in ours:
            we = math.sqrt(kl * st.G / L)
            a35, b35, a53, b53 = hull.cross_coupling(we, u)
            ours[kl] = dict(A35=a35 / nd_a, B35=b35 / nd_b, A53=a53 / nd_a, B53=b53 / nd_b)
        return ours[kl]

    pr("# table: KL strip_A35 strip_B35 strip_A53 strip_B53")
    for kl in (1, 2, 3, 5, 7.5, 10, 15, 20, 25):
        o = ours_nd(kl)
        pr(f"row {kl:g} " + " ".join(f"{o[c]:+.4f}" for c in COEFS))
    e2_sign = e2_nsm = e2_rank = True
    for c in COEFS:
        m = smooth_measured(cur[(c, "experiment")])
        line = []
        errs = {"strip": []}
        for s in PUB:
            errs[s] = []
        for x, y in m:
            errs["strip"].append((x, ours_nd(round(x, 4))[c] - y))
            for s in PUB:
                v = interp(cur[(c, s)], x)
                if v is not None:
                    errs[s].append((x, v - y))
        # signs: the measured median over KL >= 3 against ours at the same points
        hi = [(x, y) for x, y in m if x >= 3]
        med = sorted(y for _, y in hi)[len(hi) // 2]
        osgn = sorted(ours_nd(round(x, 4))[c] for x, _ in hi)[len(hi) // 2]
        same = (med > 0) == (osgn > 0)
        e2_sign &= same
        # against NSM at KL 5-25
        dev = []
        for kl in (5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 24):
            v = interp(cur[(c, "NSM")], kl)
            if v is not None and abs(v) > 1e-9:
                dev.append(ours_nd(kl)[c] / v - 1)
        worst = max(dev, key=abs)
        e2_nsm &= abs(worst) <= 0.20
        e2_rank &= rms([e for _, e in errs["strip"]]) > rms([e for _, e in errs["modified EUT"]])
        pr(f"{c}: {len(m)} measured KL {m[0][0]:.2f}-{m[-1][0]:.2f}; measured median (KL>=3) {med:+.3f}, strip {osgn:+.3f}"
           f" (same sign {same}); strip/NSM - 1 at KL 5-24: mean {100 * sum(dev) / len(dev):+.0f}%, worst {100 * worst:+.0f}%")
        pr("   rms error against measured: " + ", ".join(f"{k} {rms([e for _, e in v]):.4f} (n {len(v)})" for k, v in errs.items()))
        pr("   rms error, KL >= 3 only: " + ", ".join(f"{k} {rms([e for x, e in v if x >= 3]):.4f}" for k, v in errs.items()))
    pr(f"E2 signs {e2_sign}; within 20% of NSM at KL 5-24 {e2_nsm}; strip rms > modified EUT rms for all four {e2_rank}")

    # ------------------------------------------------------------------ B. motions and sigma against everything
    pr("## B. motions and added resistance: strip, STAWAVE-2 and the four published curves against measured")
    P = {}

    def at(x):
        if x not in P:
            P[x] = pred.at(x)
        return P[x]

    e1 = True
    for q in ("heave", "pitch"):
        dev = []
        for x in [1.0 + 0.05 * i for i in range(21)]:
            v = interp(cur[(q, "NSM")], x)
            dev.append(at(round(x, 4))[q] / v - 1)
        worst = max(dev, key=abs)
        e1 &= abs(worst) <= 0.10
        pr(f"E1 {q}: strip/NSM - 1 over lambda/L 1.0-2.0 (21 points): mean {100 * sum(dev) / len(dev):+.1f}%, worst {100 * worst:+.1f}%")
    heave_rms = {}
    for q in ("heave", "pitch"):
        pts = [(x, v) for x, v in sorted(meas[q]) if 0.8 <= x <= 2.0 + 1e-9]
        errs = {"strip": [at(x)[q] - v for x, v in pts]}
        for s in PUB:
            errs[s] = [interp(cur[(q, s)], x) - v for x, v in pts if interp(cur[(q, s)], x) is not None]
        pr(f"{q} rms error over lambda/L 0.8-2.0 ({len(pts)} measured points): " +
           ", ".join(f"{k} {rms(v):.3f} (n {len(v)})" for k, v in errs.items()))
        res = {k: rms(v) for k, v in errs.items()}
        if q == "heave":
            heave_rms = res
        for s in ["strip"] + PUB:
            mid = [(x, v) for x, v in pts if 1.0 <= x <= 1.3 + 1e-9]
            vals = [(at(x)[q] if s == "strip" else interp(cur[(q, s)], x)) for x, _ in mid]
            e = [p / v - 1 for p, (_, v) in zip(vals, mid) if p is not None]
            pr(f"   {q} {s}: mean error at lambda/L 1.0-1.3 {100 * sum(e) / len(e):+.1f}% ({len(e)} points)")
    hr = heave_rms
    e3 = hr["modified EUT"] < hr["modified NSM"] < hr["strip"] <= 1.2 * hr["NSM"] and hr["strip"] < hr["EUT"]
    pr(f"E3 heave ranking modified EUT {hr['modified EUT']:.3f} < modified NSM {hr['modified NSM']:.3f} < strip "
       f"{hr['strip']:.3f} <= 1.2 x NSM {1.2 * hr['NSM']:.3f}, strip < EUT {hr['EUT']:.3f}: {e3}")

    allpts = [p for s in wt.SERIES for p in meas[s]]
    mean = [(x, v) for x, v in wt.by_lambda(allpts) if 0.65 <= x <= 2.0 + 1e-9]
    sig = {"strip": [at(x)["strip"] - v for x, v in mean],
           "strip+refl": [at(x)["strip"] + at(x)["refl"] - v for x, v in mean],
           "STAWAVE-2": [at(x)["sta"] - v for x, v in mean]}
    for s in PUB:
        sig[s] = [interp(cur[("raw", s)], x, clamp=True) - v for x, v in mean]
    pr(f"sigma rms error against the measured mean over lambda/L 0.65-2.0 ({len(mean)} lambdas): " +
       ", ".join(f"{k} {rms(v):.2f}" for k, v in sig.items()))
    pr("   (published curves interpolated; the NSM and modified-NSM dashes start at lambda/L 0.64-0.65, clamped there)")
    best = min(PUB, key=lambda s: rms(sig[s]))
    e6 = rms(sig["strip+refl"]) < 1.5 * rms(sig[best])
    pr(f"E6 strip+refl {rms(sig['strip+refl']):.2f} < 1.5 x best published ({best}, {rms(sig[best]):.2f}): {e6}")
    fine = [round(0.30 + 0.01 * i, 2) for i in range(171)]
    pk = {}
    for s in PUB:
        xb, vb = max(cur[("raw", s)], key=lambda c: c[1])
        pk[s] = (xb, vb)
        pr(f"published {s} sigma peak {vb:.2f} at lambda/L {xb:.2f}")
    sc = [(x, at(x)["strip"]) for x in fine]
    xs0, vs0 = max(sc, key=lambda c: c[1])
    e1s = abs(vs0 / pk["NSM"][1] - 1) <= 0.15
    pr(f"strip sigma peak {vs0:.2f} at lambda/L {xs0:.2f}; against NSM {100 * (vs0 / pk['NSM'][1] - 1):+.1f}%")
    pr(f"E1 (motions within 10% of NSM at 1.0-2.0 and sigma peak within 15%): {e1 and e1s}")

    # ------------------------------------------------------------------ C. strip with measured or modified-EUT coupling
    pr("## C. strip theory with its cross-coupling replaced (motion equations only)")
    smooth = {c: smooth_measured(cur[(c, "experiment")]) for c in COEFS}

    def coupling_from(source):
        def f(we):
            kl = we * we * L / st.G
            vals = []
            for c in COEFS:
                cv = smooth[c] if source == "measured" else cur[(c, source)]
                v = interp(cv, kl, clamp=True)
                vals.append(v * (nd_a if c[0] == "A" else nd_b))
            return tuple(vals)
        return f

    # self-check: our own coefficients through the override reproduce the plain response
    w = math.sqrt(2 * math.pi / (1.1 * L) * st.G)
    z0, t0_, r0, _ = hull.response(w, u)
    z1, t1, r1, _ = hull.response(w, u, coupling=lambda we: hull.cross_coupling(we, u))
    pr(f"check: override with the strip's own coupling at lambda/L 1.1: heave {abs(z0):.6f} vs {abs(z1):.6f}, "
       f"sigma {r0 / pred.norm:.6f} vs {r1 / pred.norm:.6f}")
    k = lambda x: 2 * math.pi / (x * L)
    res = {}
    for source in ("measured", "modified EUT"):
        cf = coupling_from(source)
        R = {}
        for x in sorted(set(fine) | {round(x, 4) for x, _ in meas["heave"]} | {round(x, 4) for x, _ in meas["pitch"]}):
            if x < 0.3:
                continue
            ww = math.sqrt(k(x) * st.G)
            z, th, raw, we = hull.response(ww, u, coupling=cf)
            R[x] = dict(heave=abs(z), pitch=abs(th) / k(x), strip=raw / pred.norm, kl=we * we * L / st.G)
        res[source] = R
        pr(f"-- coupling from {source} (KL outside the source's range clamped to its end values; "
           f"lambda/L 0.65 is KL {R[0.65]['kl']:.1f}, 2.0 is KL {R[2.0]['kl']:.1f})")
        for q in ("heave", "pitch"):
            pts = [(x, v) for x, v in sorted(meas[q]) if 0.8 <= x <= 2.0 + 1e-9]
            e_all = [R[round(x, 4)][q] - v for x, v in pts]
            mid = [(x, v) for x, v in pts if 1.0 <= x <= 1.3 + 1e-9]
            e_mid = [R[round(x, 4)][q] / v - 1 for x, v in mid]
            e_mid0 = [at(x)[q] / v - 1 for x, v in mid]
            pr(f"   {q}: rms over 0.8-2.0 {rms(e_all):.3f} (plain strip {rms([at(x)[q] - v for x, v in pts]):.3f}); mean error at "
               f"1.0-1.3 {100 * sum(e_mid) / len(e_mid):+.1f}% (plain {100 * sum(e_mid0) / len(e_mid0):+.1f}%)")
            pr("   " + " ".join(f"{x:.2f}:{R[round(x, 4)][q]:.3f}/{v:.3f}" for x, v in pts))
        cs = [(x, R[x]["strip"]) for x in fine]
        xb, vb = max(cs, key=lambda c: c[1])
        e_sig = [R[round(x, 2)]["strip"] + at(x)["refl"] - v for x, v in mean]
        pr(f"   sigma peak {vb:.2f} at lambda/L {xb:.2f} (plain strip {vs0:.2f} at {xs0:.2f}); strip+refl rms over 0.65-2.0 "
           f"{rms(e_sig):.2f} (plain {rms(sig['strip+refl']):.2f})")
        res[source + "_peak"] = (xb, vb)
    hm = res["measured"]
    mid = [(x, v) for x, v in sorted(meas["heave"]) if 1.0 <= x <= 1.3 + 1e-9]
    e4v = sum(hm[round(x, 4)]["heave"] / v - 1 for x, v in mid) / len(mid)
    pr(f"E4 mean heave error at 1.0-1.3 with measured coupling {100 * e4v:+.1f}% (< +10%): {e4v < 0.10}")
    xb, vb = res["measured_peak"]
    e5 = vb < vs0 and xb > xs0 and 9.2 <= vb <= 13.2
    pr(f"E5 sigma peak with measured coupling {vb:.2f} at {xb:.2f} vs plain {vs0:.2f} at {xs0:.2f}, in 9.2-13.2: {e5}")

    # ------------------------------------------------------------------ D. post hoc: which coefficients carry it
    pr("## D. post hoc (added after the first run; not in the committed plan): which coupling terms carry the heave overshoot")
    mc = coupling_from("measured")
    variants = {
        "strip + STF A53 (A53 = -A35, Salvesen-Tuck-Faltinsen)": lambda we: (lambda c: (c[0], c[1], -c[0], c[3]))(hull.cross_coupling(we, u)),
        "strip A, measured B35 and B53": lambda we: (lambda c, m: (c[0], m[1], c[2], m[3]))(hull.cross_coupling(we, u), mc(we)),
        "measured A35 and A53, strip B": lambda we: (lambda c, m: (m[0], c[1], m[2], c[3]))(hull.cross_coupling(we, u), mc(we)),
        "A35 = A53 = 0, strip B": lambda we: (lambda c: (0.0, c[1], 0.0, c[3]))(hull.cross_coupling(we, u)),
        "strip B scaled by 0.75": lambda we: (lambda c: (c[0], 0.75 * c[1], c[2], 0.75 * c[3]))(hull.cross_coupling(we, u)),
    }
    for name, cf in variants.items():
        hv = {}
        for x, v in sorted(meas["heave"]):
            if 1.0 <= x <= 1.3 + 1e-9:
                z, th, raw, we = hull.response(math.sqrt(k(x) * st.G), u, coupling=cf)
                hv[x] = abs(z) / v - 1
        pts = [(x, v) for x, v in sorted(meas["heave"]) if 0.8 <= x <= 2.0 + 1e-9]
        e_all = [abs(hull.response(math.sqrt(k(x) * st.G), u, coupling=cf)[0]) - v for x, v in pts]
        cs = [(x, hull.response(math.sqrt(k(x) * st.G), u, coupling=cf)[2] / pred.norm) for x in fine if 0.8 <= x <= 1.6]
        xb, vb = max(cs, key=lambda c: c[1])
        pr(f"{name}: heave mean error at 1.0-1.3 {100 * sum(hv.values()) / len(hv):+.1f}%, heave rms 0.8-2.0 {rms(e_all):.3f}; "
           f"sigma peak {vb:.2f} at {xb:.2f}")
    pr("# heave table (figure): lambda_L strip strip_A0 strip_measured_coupling NSM modified_EUT modified_NSM")
    a0 = variants["A35 = A53 = 0, strip B"]
    for i in range(25):
        x = round(0.8 + 0.05 * i, 2)
        ww = math.sqrt(k(x) * st.G)
        vals = [abs(hull.response(ww, u)[0]), abs(hull.response(ww, u, coupling=a0)[0]), abs(hull.response(ww, u, coupling=mc)[0])]
        vals += [interp(cur[("heave", s_)], x) for s_ in ("NSM", "modified EUT", "modified NSM")]
        pr(f"hrow {x:.2f} " + " ".join("nan" if v is None else f"{v:.4f}" for v in vals))
    pr(f"runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
