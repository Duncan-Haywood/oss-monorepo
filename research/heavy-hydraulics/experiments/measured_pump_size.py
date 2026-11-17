"""Milestone 5w: a smaller fixed open-centre pump on the measured wheel loader, priced in cycle time.

5t to 5v kept the loader's own 63 cc pump in the open-centre counterfactual (r = 1.79, break-even
87 bar under 5t's case (b)). Here the fixed pump is swept from 63 down to 25 cc at the measured
engine speed. Where the open-centre demand q_dem (sections moving for open-centre) exceeds the pump
flow q_p, the actuators slow so the pump delivers the demanded volume: the sample lasts
dt q_dem / q_p and its hydraulic energy is q_dem (p + d) dt, which is exactly what
measured_breakeven.parts charges with q_oc = max(q_p, q_dem). So energy needs only the displacement
parameter; time is added here. Load-sensing is charged its own pump limit (the machine's 63 cc
variable pump, max(1, q_tot / q_63) per sample), so the net time ratio isolates the smaller pump.
Predictions W1 to W5 are in LOG.md (5w), registered before this script existed.

Data: Linjama et al., Zenodo doi:10.5281/zenodo.10639199, CC BY 4.0 (see measured_loader.py).
Needs numpy and scipy. Usage: python measured_pump_size.py <path to Short_Y_cycle_data.mat>
"""
import math
import os
import statistics
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import cycle_starts, slowed_time  # noqa: E402
from heavy_hydraulics.spool_floor import size_spool  # noqa: E402
from measured_breakeven import parts, orifice_drop, MEASURED_MARGIN  # noqa: E402

VGS = (63, 56, 50, 45, 40, 36, 32, 28, 25)   # cc, swept (registered in LOG.md, 5w)
LEAK = 2.5                                   # L/min, as in parts()
M63 = {"m": 87.0, "p_s": 99.5}               # 5t/5v whole-record values under (b), checked below


def spearman(a, b):
    ra = np.argsort(np.argsort(a)).astype(float)
    rb = np.argsort(np.argsort(b)).astype(float)
    return float(np.corrcoef(ra, rb)[0, 1])


def pump_flow(w, vg_cc):
    return np.maximum(0.0, vg_cc * 1e-6 * 1e3 * w / (2 * math.pi) * 60 - LEAK)


def times(r, masks, vg_cc, sl=slice(None)):
    """(open-centre time, load-sensing time, open-centre shortfall share of OC-moving samples), s."""
    dt = r["dt"]
    w = r["w"][sl]
    qs = [s[0][sl] for s in r["secs"]]
    ps = [s[1][sl] for s in r["secs"]]
    known = [(q > 0) & ~np.isnan(p) for q, p in zip(qs, ps)]
    q_dem = sum(np.where(k & m[sl], q, 0.0) for q, k, m in zip(qs, known, masks))
    q_tot = sum(np.where(q > 0, q, 0.0) for q in qs)
    qp, q63 = pump_flow(w, vg_cc), pump_flow(w, 63)
    assert (qp[q_dem > 0] > 0).all()
    t_oc = float(np.maximum(1.0, q_dem / qp).sum() * dt)
    t_ls = float(np.maximum(1.0, np.where(q63 > 0, q_tot / np.where(q63 > 0, q63, 1.0), 1.0)).sum() * dt)
    mv = q_dem > 0
    return t_oc, t_ls, float((q_dem[mv] > qp[mv]).mean())


def p_s(x):
    return (x["r"] * x["p_Q"] - x["p_q"]) / (x["r"] - 1)


def main(path):
    from measured_loader import load
    from measured_motion import positions, stationary_np
    from spool_floor import TABLE
    r = load(path)
    dt = r["dt"]
    out = []
    p = out.append
    win = int(round(1.0 / dt))
    floors = [float(np.percentile(np.abs(q[stationary_np(x, win, 0.5e-3)]), 99))
              for (q, _), (x, _) in zip(r["secs"], positions(path))]
    masks = [s[0] > f for s, f in zip(r["secs"], floors)]
    rows = [size_spool(float(np.percentile(q[q > 0], 99.9)), TABLE, 0) for q, _ in r["secs"]]
    drops = [orifice_drop(q, row) for (q, _), row in zip(r["secs"], rows)]
    pn = 5.0
    p(f"record {len(r['t'])} samples, {r['t'][-1]-r['t'][0]:.1f} s; case (b): PVG 32 orifice floor, spools "
      f"{rows[0]['spool']}, {rows[1]['spool']}, p_n {pn}; q_sb 0; engine speed measured, leak {LEAK} L/min")

    # data check: the derived demand against the 63 cc pump's geometric flow and the authors' angle estimate
    q_tot = sum(np.where(q > 0, q, 0.0) for q, _ in r["secs"])
    geo = 63e-6 * 1e3 * r["w"] / (2 * math.pi) * 60
    mv = q_tot > 2.0
    over = mv & (q_tot > geo)
    ex = (q_tot - geo)[over]
    p(f"data check: demand above the 63 cc pump's geometric flow (no leak) in {over.sum()/mv.sum()*100:.1f}% of samples "
      f"with demand > 2 L/min (excess median {np.median(ex):.1f}, p99 {np.percentile(ex, 99):.1f} L/min); the authors' "
      f"pump flow estimate equals the summed valve flows (mean gap {abs(r['Q'][mv]-q_tot[mv]).mean():.2e} L/min) and "
      f"their angle estimate there has median {np.median(r['alpha'][over]):.3f} (> 1 is beyond full stroke), so the excess "
      f"is in the velocity-derived flows; load-sensing's own 63 cc limit is charged so it cancels in the net time ratio")

    base = parts(r, masks, drops, pn)
    assert abs(base["m"] - parts(r, masks, drops, pn, vg=63e-6)["m"]) == 0
    assert abs(round(base["m"], 1) - M63["m"]) < 1e-9 and abs(round(p_s(base), 1) - M63["p_s"]) < 1e-9
    p(f"check: vg = 63 cc reproduces 5t/5v under (b): m* {base['m']:.1f} bar, p_s {p_s(base):.1f} bar")

    # check: the slowed-sample energy identity (q_p dt' (p + d) with dt' = dt q_dem / q_p equals max() charging)
    vg = 32
    qp = pump_flow(r["w"], vg)
    qs = [s[0] for s in r["secs"]]
    known = [(q > 0) & ~np.isnan(pp) for q, pp in r["secs"]]
    q_dem = sum(np.where(k & m, q, 0.0) for q, k, m in zip(qs, known, masks))
    stretch = np.maximum(1.0, q_dem / qp)
    assert np.allclose(qp * stretch * (q_dem > qp), q_dem * (q_dem > qp))
    p("check: in every slowed sample, pump flow x stretched time = demanded volume (energy identity behind parts(vg))")
    n = 50000
    ref_t, ref_sf = slowed_time(zip(q_dem[:n].tolist(), qp[:n].tolist()), dt)
    got_t, _, got_sf = times(r, masks, vg, slice(0, n))
    assert abs(got_t - ref_t) <= 1e-9 * ref_t and abs(got_sf - ref_sf) <= 1e-12, (got_t, ref_t, got_sf, ref_sf)
    p("check: numpy open-centre time equals the tested stdlib measured.slowed_time on the first 50,000 samples (32 cc)")

    p("")
    p("whole record, sweep of the fixed open-centre pump (case b)")
    p("  Vg cc   m* bar      r    p_s   p_q  beta  idle  shortfall%  T_oc/T_ls  (T_oc s, T_ls s)")
    sweep = []
    for vg in VGS:
        x = parts(r, masks, drops, pn, vg=vg * 1e-6)
        t_oc, t_ls, sf = times(r, masks, vg)
        sweep.append((vg, x, t_oc / t_ls))
        p(f"  {vg:5d} {x['m']:8.1f} {x['r']:6.3f} {p_s(x):6.1f} {x['p_q']:5.1f} {x['beta']:5.3f} {x['idle']:5.1f} "
          f"{sf*100:10.1f} {t_oc/t_ls:10.4f}  ({t_oc:.1f}, {t_ls:.1f})")
    ms = [x["m"] for _, x, _ in sweep]
    assert all(a > b for a, b in zip(ms, ms[1:])), "m* not monotone in Vg"

    # V_eq: registered as linear interpolation on the sweep; bisection on the continuous Vg reported beside it
    v_eq = None
    for (v1, x1, _), (v2, x2, _) in zip(sweep, sweep[1:]):
        if x1["m"] >= MEASURED_MARGIN >= x2["m"]:
            v_eq = v1 + (MEASURED_MARGIN - x1["m"]) * (v2 - v1) / (x2["m"] - x1["m"])
    p("")
    if v_eq is None:
        p(f"V_eq: m* never reaches {MEASURED_MARGIN} bar on the sweep (smallest {ms[-1]:.1f} bar at {VGS[-1]} cc)")
        lo, hi = 5.0, float(VGS[-1])
        while hi - lo > 1e-3:
            mid = (lo + hi) / 2
            if parts(r, masks, drops, pn, vg=mid * 1e-6)["m"] > MEASURED_MARGIN:
                hi = mid
            else:
                lo = mid
        v_bis = (lo + hi) / 2
    else:
        lo, hi = float(VGS[-1]), float(VGS[0])
        while hi - lo > 1e-3:
            mid = (lo + hi) / 2
            if parts(r, masks, drops, pn, vg=mid * 1e-6)["m"] > MEASURED_MARGIN:
                hi = mid
            else:
                lo = mid
        v_bis = (lo + hi) / 2
        p(f"V_eq (linear interpolation on the sweep, as registered) {v_eq:.2f} cc")
    xe = parts(r, masks, drops, pn, vg=v_bis * 1e-6)
    t_oc, t_ls, sf = times(r, masks, v_bis)
    p(f"V_eq (bisection) {v_bis:.2f} cc: m* {xe['m']:.2f} bar, r {xe['r']:.3f}, p_s {p_s(xe):.1f}, p_q {xe['p_q']:.1f}, "
      f"beta {xe['beta']:.3f}, idle {xe['idle']:.1f} bar; T_oc/T_ls {t_oc/t_ls:.4f}; shortfall {sf*100:.1f}% of OC-moving samples")
    p(f"  terms: beta (r-1) p_s {xe['beta']*(xe['r']-1)*p_s(xe):.1f}, drop {xe['drop']:.1f}, idle {xe['idle']:.1f} bar")
    # peak pump flow at V_eq against the record's demand
    qe = pump_flow(r["w"], v_bis)
    p(f"  pump flow at V_eq: mean {qe.mean():.1f} L/min (63 cc: {pump_flow(r['w'], 63).mean():.1f}); demand p50/p90/p99 while "
      f"moving {np.percentile(q_tot[mv], 50):.1f}/{np.percentile(q_tot[mv], 90):.1f}/{np.percentile(q_tot[mv], 99):.1f} L/min")

    # per Y-cycle
    starts = cycle_starts(list(r["x"]), 0.30)
    cyc = list(zip(starts, starts[1:]))
    p("")
    p(f"per Y-cycle ({len(cyc)} cycles): m*_c and net time ratio, median (min to max)")
    for vg in VGS + (round(v_bis, 2),):
        mc, tr = [], []
        for i0, i1 in cyc:
            sl = slice(i0, i1)
            mc.append(parts(r, masks, drops, pn, sl=sl, vg=vg * 1e-6)["m"])
            a, b, _ = times(r, masks, vg, sl)
            tr.append(a / b)
        p(f"  {vg:6.2f} cc: m*_c {statistics.median(mc):6.1f} ({min(mc):6.1f} to {max(mc):6.1f}); time ratio "
          f"{statistics.median(tr):.4f} ({min(tr):.4f} to {max(tr):.4f}); cycles with m*_c <= {MEASURED_MARGIN}: "
          f"{sum(m <= MEASURED_MARGIN for m in mc)}")
    r63 = [parts(r, masks, drops, pn, sl=slice(i0, i1))["r"] for i0, i1 in cyc]
    tr_eq = []
    for i0, i1 in cyc:
        a, b, _ = times(r, masks, v_bis, slice(i0, i1))
        tr_eq.append(a / b)
    rho = spearman(r63, tr_eq)
    p(f"  Spearman(r at 63 cc, time ratio at V_eq) {rho:.3f}")

    # trade curve: bar of break-even margin given up per percent of record time
    p("")
    p("trade: per step down the sweep, break-even margin lost per percent of extra record time")
    for (v1, x1, t1), (v2, x2, t2) in zip(sweep, sweep[1:]):
        dtp = (t2 - t1) * 100
        p(f"  {v1:2d} -> {v2:2d} cc: m* -{x1['m']-x2['m']:5.1f} bar, time +{dtp:6.3f}% "
          f"({(x1['m']-x2['m'])/dtp if dtp > 0 else float('inf'):8.1f} bar per %)")

    # predictions
    p("")
    w1 = all(x["m"] > MEASURED_MARGIN for v, x, _ in sweep if v >= 40)
    p(f"W1 {'HOLDS' if w1 else 'REFUTED'} (m* > {MEASURED_MARGIN} for every Vg >= 40 cc: at 40 cc {dict((v, x) for v, x, _ in sweep)[40]['m']:.1f})")
    p(f"W2 {'HOLDS' if v_eq is not None and 25 <= v_eq <= 40 else 'REFUTED'} (V_eq in 25 to 40 cc: "
      f"{'%.2f' % v_eq if v_eq is not None else 'below 25, bisection %.2f' % v_bis})")
    p(f"W3 {'HOLDS' if t_oc / t_ls > 1.25 else 'REFUTED'} (net time ratio at V_eq > 1.25: {t_oc/t_ls:.4f})")
    p(f"W4 {'HOLDS' if p_s(xe) < M63['p_s'] else 'REFUTED'} (p_s at V_eq < {M63['p_s']}: {p_s(xe):.1f})")
    p(f"W5 {'HOLDS' if rho < -0.5 else 'REFUTED'} (Spearman(r63, time ratio at V_eq) < -0.5: {rho:.3f})")
    return "\n".join(out)


if __name__ == "__main__":
    text = main(sys.argv[1])
    print(text)
    with open(os.path.join(HERE, "measured_pump_size_results.txt"), "w") as fh:
        fh.write(text + "\n")
