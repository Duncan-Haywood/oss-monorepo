"""Milestone 6c: the break-even rest-of-machine fuel rate over 5z's 384 geometry cases, from the raw motion.

6b found, from the committed central results only, that a smaller fixed open-centre pump on the measured
excavator (folder `75` of `fuxi-robot/excavator-motion`, CC BY-NC-SA 4.0) burns less fuel than load-sensing
only if the rest of the machine burns under f_t,max = 2.46 L/h over the extra working time. Here the motion
is read again, so for every geometry case (lever factors 1 to 2.5 per joint, bucket sign, swing share
0/0.5/1, as 5z and 6a) the volume ratio r(q_p), the time ratio and the mean load-sensing demand are exact
sums over the samples; no convexity bracket is needed. Predictions D1 to D6 are in LOG.md (6c), registered
before this script existed.

Per hour of load-sensing work, open-centre minus load-sensing fuel is b (m* - m) Q_LS / (600 eta)
+ f_t (tau - 1), with m* = 0.78 (r - 1) p (5u); f_t*(q_p) zeroes it (measured.breakeven_rest_rate) and
f_t,max is its maximum over the fixed pump size q_p.

Usage: python excavator_breakeven_geometry.py [cache dir]   (default ~/.cache/heavy-hydraulics-excavator)
Needs numpy and h5py (cache shared with 5z and 6a). Writes the 384-case table to
excavator_breakeven_geometry_cases.csv next to this script.
"""
import itertools
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import breakeven_rest_rate, time_ratio_from_r  # noqa: E402
from measured_excavator_flow import load, CYL, Q_PUMP, COV, P_TOP, SHARE  # noqa: E402
from measured_excavator_pump_size import Trace, KIN, spearman  # noqa: E402

JOINTS = ("boom", "arm", "bucket")
P_C = SHARE * P_TOP
M_C, B_C, ETA_C = 20.0, 0.2332, 0.818               # 6b central; b (5n) and eta (5x) borrowed from the loader
MARGINS, PRESS = (14.0, 20.0, 24.9, 25.0), (100.0, P_C, 174.0)
BS, ETAS = (0.20, B_C, 0.26), (0.75, ETA_C, 0.95)
F_LOADER = {"low": 1.48, "rest of machine": 5.15, "still": 5.99}   # 5x, L/h, borrowed
GRID = np.arange(10.0, Q_PUMP + 0.25, 0.5)          # fixed pump sizes, L/min


def case_curves(tr):
    """Exact r(q_p), tau(q_p) on GRID, plus Q_LS, mu, phi and r(219), for one geometry case."""
    qm, wm = tr.q, tr.w
    vd = float((qm * wm).sum())
    r = np.array([float((np.maximum(g, qm) * wm).sum()) / vd for g in GRID])
    qa = np.concatenate([q for q, _, _ in tr.files])
    wa = np.concatenate([np.full(len(q), dt) for q, _, dt in tr.files])
    t_ls = float((np.maximum(1.0, qa / Q_PUMP) * wa).sum())
    tau = np.array([float((np.maximum(1.0, qa / g) * wa).sum()) for g in GRID]) / t_ls
    t_mv = float(wm.sum())
    mu, phi = vd / t_mv, (float(wa.sum()) - t_mv) / t_mv
    r219 = float((np.maximum(Q_PUMP, qm) * wm).sum()) / vd
    return r, tau, vd / t_ls, mu, phi, r219


def fstar(r, tau, q_ls, m, p, b, eta):
    """f_t*(q_p) on GRID (0 where open-centre saves no pump energy or loses no time)."""
    ms = COV * (r - 1.0) * p
    ok = (ms < m) & (tau > 1.0)
    out = np.zeros_like(r)
    out[ok] = b * (m - ms[ok]) * q_ls / (600.0 * eta * (tau[ok] - 1.0))
    return out


def main(cache):
    recs = load(cache)
    allq = np.concatenate([r["q"] for r in recs])
    span = np.percentile(allq, 99.9, axis=0) - np.percentile(allq, 0.1, axis=0)
    lev0 = [CYL[k][2] / span[j] for j, k in enumerate(JOINTS)]
    out = []
    p = out.append
    p("Milestone 6c: break-even rest-of-machine fuel rate over 384 geometry cases (exact r from the motion)")
    p("(fuxi-robot/excavator-motion, folder 75, CC BY-NC-SA 4.0; geometry XCMG XE80E brochure; demand as 5z, slowing as 6a)")
    p(f"central parameters: margin {M_C} bar, p {P_C:.0f} bar, b {B_C} L/kWh and eta {ETA_C} (both borrowed from the loader); "
      f"pump grid {GRID[0]:.1f} to {GRID[-1]:.1f} L/min in 0.5 steps")
    p("")
    fs = (1.0, 1.5, 2.0, 2.5)
    rows, sweep_max, sweep_all = [], [], []
    for fb, fa, fu in itertools.product(fs, repeat=3):
        lev = [lev0[0] / fb, lev0[1] / fa, lev0[2] / fu]
        for bs in (1, -1):
            for s_sw in (0.0, 0.5, 1.0):
                tr = Trace(recs, lev, KIN + (bs,), s_sw)
                r, tau, q_ls, mu, phi, r219 = case_curves(tr)
                # identity of 6b, checked on every case at three pump sizes
                for k in (40, 160, 300):
                    ti = time_ratio_from_r(r[k], GRID[k], r219, Q_PUMP, mu, phi)
                    assert abs(ti - tau[k]) < 1e-9, (ti, tau[k])
                f = fstar(r, tau, q_ls, M_C, P_C, B_C, ETA_C)
                k = int(f.argmax())
                assert abs(breakeven_rest_rate(M_C, COV * (r[k] - 1) * P_C, q_ls, tau[k], B_C, ETA_C) - f[k]) < 1e-12
                allf = [float(fstar(r, tau, q_ls, m, pr, b, eta).max())
                        for m in MARGINS for pr in PRESS for b in BS for eta in ETAS]
                sweep_all += allf
                sweep_max.append(max(allf))
                rows.append({"fb": fb, "fa": fa, "fu": fu, "bs": bs, "sw": s_sw, "mu": mu, "p99": tr.p99,
                             "peak": tr.p99 / mu, "r219": r219, "q_ls": q_ls, "f": float(f[k]), "q": float(GRID[k]),
                             "r_at": float(r[k]), "tau_at": float(tau[k]), "fmin_sweep": min(allf),
                             "fmax_sweep": max(allf),
                             "curve": f if (fb, fa, fu, bs, s_sw) == (1.0, 1.0, 1.0, 1, 0.5) else None})
    cen = next(x for x in rows if x["curve"] is not None)
    p(f"central geometry (levers 1/1/1, bucket +1, swing 0.5): mu {cen['mu']:.1f} L/min, r(219) {cen['r219']:.3f}, "
      f"Q_LS {cen['q_ls']:.2f} L/min (6b: 100.9, 2.175, 98.18)")
    p("  f_t*(q_p), L/h (6b's bracketed values in brackets):")
    ref6b = {40.0: "0.49..0.63", 60.0: "0.92..1.41", 70.0: "1.25..2.18", 80.0: "1.78..2.41", 87.5: "2.46 (at 87.6)",
             95.0: "2.19", 98.5: "1.86", 102.0: "1.37..1.38", 105.0: "0.78..0.79", 107.0: "0.28"}
    for q, ref in ref6b.items():
        k = int(round((q - GRID[0]) / 0.5))
        p(f"    q_p {GRID[k]:6.1f}: {cen['curve'][k]:.3f}   [{ref}]")
    p(f"  f_t,max {cen['f']:.3f} L/h at q_p {cen['q']:.1f} L/min (r {cen['r_at']:.3f}, tau {cen['tau_at']:.3f}; "
      f"{cen['q'] / cen['p99']:.3f} of p99)")
    p("")
    f = np.array([x["f"] for x in rows])
    qf = np.array([x["q"] / x["p99"] for x in rows])
    pk = np.array([x["peak"] for x in rows])
    pct = lambda a, k: float(np.percentile(a, k))  # noqa: E731
    p(f"Over the 384 cases, central parameters: f_t,max min {f.min():.2f}, p10 {pct(f, 10):.2f}, median {np.median(f):.2f}, "
      f"p90 {pct(f, 90):.2f}, max {f.max():.2f} L/h")
    for name, val in F_LOADER.items():
        p(f"  share of cases above the loader's {name} rate {val} L/h: {np.mean(f > val) * 100:.1f}%")
    p(f"  share above the central geometry's {cen['f']:.2f} L/h: {np.mean(f > cen['f']) * 100:.1f}%")
    p(f"  maximising pump / p99 demand: min {qf.min():.3f}, median {np.median(qf):.3f}, max {qf.max():.3f}; "
      f"share in 0.3 to 0.5: {np.mean((qf >= 0.3) & (qf <= 0.5)) * 100:.1f}%")
    p(f"  peakiness p99/mu: {pk.min():.2f} to {pk.max():.2f}; Spearman(peakiness, f_t,max) {spearman(pk, f):+.3f}; "
      f"Spearman(r(219), f_t,max) {spearman(np.array([x['r219'] for x in rows]), f):+.3f}")
    p("")
    p("Median f_t,max (central parameters) by one geometry factor, the others pooled:")
    for key, lab, vals in (("fb", "boom lever factor", fs), ("fa", "arm lever factor", fs), ("fu", "bucket lever factor", fs),
                           ("bs", "bucket sign", (1, -1)), ("sw", "swing share", (0.0, 0.5, 1.0))):
        p(f"  {lab:>20}: " + "; ".join(f"{v:g}: {np.median([x['f'] for x in rows if x[key] == v]):.2f} "
                                         f"({min(x['f'] for x in rows if x[key] == v):.2f} to "
                                         f"{max(x['f'] for x in rows if x[key] == v):.2f})" for v in vals))
    p("")
    sa = np.array(sweep_all)
    p(f"Full sweep, 384 cases x 108 parameter sets = {len(sa)}: f_t,max min {sa.min():.2f}, median {np.median(sa):.2f}, "
      f"p90 {pct(sa, 90):.2f}, p99 {pct(sa, 99):.2f}, max {sa.max():.2f} L/h; share above 5.15 L/h {np.mean(sa > 5.15) * 100:.1f}%")
    worst = max(rows, key=lambda x: x["fmax_sweep"])
    p(f"  highest case: levers {worst['fb']:g}/{worst['fa']:g}/{worst['fu']:g}, bucket {worst['bs']:+d}, swing {worst['sw']:g}: "
      f"central {worst['f']:.2f} L/h, sweep {worst['fmin_sweep']:.2f} to {worst['fmax_sweep']:.2f}")
    p("")
    cdf = np.sort(f)
    p("Sorted f_t,max over the 384 cases, central parameters (every 32nd case, for the figure):")
    p(f"{'rank_pct':>9} {'f_t_max':>8}")
    for i in list(range(0, 384, 32)) + [383]:
        p(f"{(i + 1) / 384 * 100:>9.1f} {cdf[i]:>8.3f}")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 6c):")
    p(f"  D1 central exact f_t,max in 2.44 to 2.48 L/h: {ok(2.44 <= cen['f'] <= 2.48)} ({cen['f']:.3f})")
    p(f"  D2 median over 384 cases in 1.5 to 3.5 L/h: {ok(1.5 <= np.median(f) <= 3.5)} ({np.median(f):.2f})")
    p(f"  D3 under 10% of cases above 5.15 L/h: {ok(np.mean(f > 5.15) < 0.10)} ({np.mean(f > 5.15) * 100:.1f}%)")
    rho = spearman(pk, f)
    p(f"  D4 Spearman(peakiness, f_t,max) > +0.5: {ok(rho > 0.5)} ({rho:+.3f})")
    sh = np.mean((qf >= 0.3) & (qf <= 0.5))
    p(f"  D5 maximising pump in 0.3 to 0.5 of p99 in >= 80% of cases: {ok(sh >= 0.8)} ({sh * 100:.1f}%)")
    p(f"  D6 f_t,max below 10 L/h over all {len(sa)} combinations: {ok(sa.max() < 10)} (max {sa.max():.2f})")
    p("")
    p("Source: fuxi-robot/excavator-motion, https://huggingface.co/datasets/fuxi-robot/excavator-motion, CC BY-NC-SA 4.0. "
      "Derived statistics only; no data redistributed.")
    print("\n".join(out))
    with open(os.path.join(HERE, "excavator_breakeven_geometry_cases.csv"), "w") as fh:
        cols = ["fb", "fa", "fu", "bs", "sw", "mu", "p99", "peak", "r219", "q_ls", "f", "q", "r_at", "tau_at",
                "fmin_sweep", "fmax_sweep"]
        fh.write("boom_lever,arm_lever,bucket_lever,bucket_sign,swing_share,mean_moving_demand_lpm,p99_demand_lpm,"
                 "p99_over_mean,r_at_219,q_ls_lpm,ft_max_central_lph,argmax_pump_lpm,r_at_argmax,tau_at_argmax,"
                 "ft_max_sweep_min_lph,ft_max_sweep_max_lph\n")
        for x in rows:
            fh.write(",".join(f"{x[c]:g}" if isinstance(x[c], (int, float)) else f"{x[c]}" for c in cols) + "\n")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
