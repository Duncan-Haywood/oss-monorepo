"""Milestone 5t: the measured wheel loader's own break-even load-sensing margin, per Y-cycle.

5s showed that every break-even in this programme is m* = (S + D + I) / B: the open-centre energy
above load-sensing's zero-margin energy (surplus flow at load pressure S, spool drop D, neutral
bleed I), divided by load-sensing's energy per bar of margin B. Here it runs on the measured
6 t wheel loader of 5n to 5r. LS(m) is 5n's constant-margin model on the measured P-port demand
(checked against measured_loader.vec), plus an optional standby flow at m while nothing moves.
Open-centre is 5o/5r's counterfactual on the same motion (fixed 63 cc pump, noise-floor motion
masks): (a) the floor, no spool drop, p_neutral 5 bar; (b) 5r's PVG 32 orifice floor, p99.9
sizing, p_neutral 5; (c) 5o's Q2 case, 10 bar spool drop, p_neutral 10.
Predictions T1 to T5 are in LOG.md (5t), registered before this script existed.

Data: Linjama et al., Zenodo doi:10.5281/zenodo.10639199, CC BY 4.0 (see measured_loader.py).
Needs numpy and scipy. Usage: python measured_breakeven.py <path to Short_Y_cycle_data.mat>
"""
import math
import os
import statistics
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import cycle_starts  # noqa: E402
from heavy_hydraulics.breakeven import trace_breakeven  # noqa: E402
from heavy_hydraulics.spool_floor import size_spool  # noqa: E402

MEASURED_MARGIN = 24.9      # bar, median measured margin (measured_loader_results.txt, 5n)
SYNTH_ZERO_DROP = 20.53     # bar, closed-form zero-drop break-even (breakeven_closed_form_results.txt, 5s)
QSB = (0.0, 2.0, 5.0)       # L/min standby flow while nothing moves (swept; 0 is 5n's convention)


def parts(r, masks, drops, p_neutral, q_sb=0.0, sl=slice(None)):
    """numpy twin of breakeven.trace_breakeven. drops[i]: per-sample spool drop of section i."""
    dt = r["dt"]
    k = dt / 0.6
    qs = [s[0][sl] for s in r["secs"]]
    ps = [s[1][sl] for s in r["secs"]]
    ms = [m[sl] for m in masks]
    ds = [d[sl] for d in drops]
    w = r["w"][sl]
    q_fix = np.maximum(0.0, 63e-6 * 1e3 * w / (2 * math.pi) * 60 - 2.5)
    q_tot = sum(np.where(q > 0, q, 0.0) for q in qs)
    pl = np.full_like(q_fix, -np.inf)
    pin = np.full_like(q_fix, -np.inf)
    poc = np.full_like(q_fix, -np.inf)
    q_big = np.zeros_like(q_fix)
    for q, p, m, d in zip(qs, ps, ms, ds):
        known = (q > 0) & ~np.isnan(p)
        pp = np.nan_to_num(p, nan=-np.inf)
        pl = np.where(known, np.maximum(pl, pp), pl)
        on = known & m
        pin = np.where(on, np.maximum(pin, pp), pin)
        poc = np.where(on, np.maximum(poc, pp + d), poc)
        q_big += np.where(on, q, 0.0)
    ls_mv = np.isfinite(pl)
    oc_mv = np.isfinite(pin)
    q_oc = np.maximum(q_fix, q_big)
    A = float((q_tot[ls_mv] * pl[ls_mv]).sum() * k)
    B = float(q_tot[ls_mv].sum() * k + q_sb * (~ls_mv).sum() * k)
    S_oc = float((q_oc[oc_mv] * pin[oc_mv]).sum() * k)
    D = float((q_oc[oc_mv] * (poc[oc_mv] - pin[oc_mv])).sum() * k)
    I = float((q_fix[~oc_mv] * p_neutral).sum() * k)
    S = S_oc - A
    q_mv = float(q_oc[oc_mv].sum() * k)
    out = {"m": (S + D + I) / B, "A": A, "S": S, "D": D, "I": I, "B": B, "OC": S_oc + D + I,
           "dm_ddrop": q_mv / B, "dm_dpn": float(q_fix[~oc_mv].sum() * k) / B}
    # 5u/5v split (same algebra as breakeven.trace_breakeven): open-centre moving implies LS moving
    V_on = float(q_tot[oc_mv].sum() * k)
    if V_on > 0:
        A_on = float((q_tot[oc_mv] * pl[oc_mv]).sum() * k)
        r_, p_Q, p_q, d_bar, beta = q_mv / V_on, S_oc / q_mv, A_on / V_on, D / q_mv, V_on / B
        out.update(r=r_, p_Q=p_Q, p_q=p_q, d_bar=d_bar, beta=beta, A_off=A - A_on,
                   main=beta * (r_ - 1) * p_q, cov=beta * r_ * (p_Q - p_q), drop=beta * r_ * d_bar,
                   idle=(I - (A - A_on)) / B, rule2=(r_ - 1) * p_q + r_ * d_bar)
    return out


def orifice_drop(q, row):
    return 10.0 * (np.maximum(q, 0.0) / row["q10"]) ** 2


def main(path):
    from measured_loader import load, vec, bootstrap
    from measured_motion import positions, stationary_np, oc as oc_motion
    from spool_floor import oc_floor, TABLE
    r = load(path)
    dt = r["dt"]
    out = []
    p = out.append
    win = int(round(1.0 / dt))
    floors = [float(np.percentile(np.abs(q[stationary_np(x, win, 0.5e-3)]), 99))
              for (q, _), (x, _) in zip(r["secs"], positions(path))]
    masks = [s[0] > f for s, f in zip(r["secs"], floors)]
    rows = [size_spool(float(np.percentile(q[q > 0], 99.9)), TABLE, 0) for q, _ in r["secs"]]
    zero = [np.zeros_like(r["w"]) for _ in r["secs"]]
    cases = {
        "a floor, no drop, p_n 5": ([np.zeros_like(r["w"]) for _ in r["secs"]], 5.0),
        "b PVG 32 orifice floor, p_n 5": ([orifice_drop(q, row) for (q, _), row in zip(r["secs"], rows)], 5.0),
        "c 10 bar spool drop, p_n 10": ([np.full_like(r["w"], 10.0) for _ in r["secs"]], 10.0),
    }
    p(f"record {len(r['t'])} samples, {r['t'][-1]-r['t'][0]:.1f} s; noise-floor q_min lift {floors[0]:.3f}, "
      f"tilt {floors[1]:.3f} L/min; spools {rows[0]['spool']}, {rows[1]['spool']}")

    # --- checks against the code the earlier milestones' answers came from ---
    base = parts(r, masks, zero, 5.0)
    e = vec(r, MEASURED_MARGIN)
    assert abs(base["A"] + MEASURED_MARGIN * base["B"] - e["ls_model"]) <= 1e-9 * e["ls_model"]
    h_a, _, _ = oc_motion(r, masks, dp_spool=0.0, p_neutral=5.0)
    h_c, _, _ = oc_motion(r, masks, dp_spool=10.0, p_neutral=10.0)
    h_b, _, _ = oc_floor(r, masks, rows, "orifice", 5.0)
    for lab, h in zip(cases, (h_a, h_b, h_c)):
        got = parts(r, masks, *cases[lab])["OC"]
        assert abs(got - h) <= 1e-9 * h, (lab, got, h)
    n = 50000
    samples = []
    w = r["w"][:n]
    qf = np.maximum(0.0, 63e-6 * 1e3 * w / (2 * math.pi) * 60 - 2.5)
    db = cases["b PVG 32 orifice floor, p_n 5"][0]
    for i in range(n):
        secs = tuple((float(q[i]), None if math.isnan(pp[i]) else float(pp[i]), bool(m[i]), float(d[i]))
                     for (q, pp), m, d in zip(r["secs"], masks, db))
        samples.append((float(qf[i]), secs))
    ref = trace_breakeven(samples, dt, 5.0, 2.0)
    got = parts(r, masks, db, 5.0, 2.0, sl=slice(0, n))
    for key in ("m", "A", "S", "D", "I", "B", "dm_ddrop", "dm_dpn"):
        assert abs(got[key] - ref[key]) <= 1e-9 * max(1.0, abs(ref[key])), key
    meas = e["measured"]
    m_eff = (meas - base["A"]) / base["B"]
    p("checks: A + 24.9 B equals 5n's LS model; OC equals measured_motion.oc (a, c) and spool_floor.oc_floor (b);")
    p("        numpy twin equals the tested stdlib trace_breakeven on the first 50,000 samples")
    p(f"measured LS pump hydraulic energy {meas/1e3:.0f} kJ = A + m_eff B with m_eff {m_eff:.1f} bar "
      f"(the constant margin that costs what the machine spent)")

    # --- what drives S: fixed-pump flow against demand, and where LS counts as still ---
    qs = [q for q, _ in r["secs"]]
    known = [(q > 0) & ~np.isnan(pp) for q, pp in r["secs"]]
    ls_still = ~(known[0] | known[1])
    oc_mv = (known[0] & masks[0]) | (known[1] & masks[1])
    q_fix = np.maximum(0.0, 63e-6 * 1e3 * r["w"] / (2 * math.pi) * 60 - 2.5)
    q_dem = sum(np.where(k_ & m_, q, 0.0) for q, k_, m_ in zip(qs, known, masks))
    p(f"LS counts {ls_still.mean()*100:.2f}% of samples as still (no section with q > 0 and a known pressure), "
      f"so a standby flow there has almost nothing to act on; open-centre counts {(~oc_mv).mean()*100:.1f}% as still")
    p(f"while open-centre moves: fixed-pump flow mean {q_fix[oc_mv].mean():.1f} L/min, demand mean {q_dem[oc_mv].mean():.1f} "
      f"L/min (ratio {q_fix[oc_mv].mean()/q_dem[oc_mv].mean():.2f}); demand above the fixed pump in "
      f"{(q_dem[oc_mv] > q_fix[oc_mv]).mean()*100:.1f}% of those samples")

    # --- whole record ---
    p("")
    p("whole record: m* = (S + D + I) / B, bar; S, D, I as shares of S + D + I")
    whole = {}
    for lab, (drops, pn) in cases.items():
        for qsb in QSB:
            x = parts(r, masks, drops, pn, qsb)
            whole[(lab, qsb)] = x
            tot = x["S"] + x["D"] + x["I"]
            p(f"  {lab:30s} q_sb {qsb:3.1f}: m* {x['m']:5.1f}  S {x['S']/tot*100:4.1f}%  D {x['D']/tot*100:4.1f}%  "
              f"I {x['I']/tot*100:4.1f}%  (S {x['S']/x['B']:.1f}, D {x['D']/x['B']:.1f}, I {x['I']/x['B']:.1f} bar); "
              f"dm*/dd {x['dm_ddrop']:.2f}, dm*/dp_n {x['dm_dpn']:.2f}; headroom over 24.9 {x['m']-MEASURED_MARGIN:.1f} bar")

    # --- per cycle ---
    starts = cycle_starts(list(r["x"]), 0.30)
    p("")
    p(f"per Y-cycle ({len(starts)-1} cycles, q_sb 0): median, 95% bootstrap of the mean, min, max of m*_c, bar")
    per = {}
    for lab, (drops, pn) in cases.items():
        v = [parts(r, masks, drops, pn, 0.0, sl=slice(i0, i1)) for i0, i1 in zip(starts, starts[1:])]
        ms = [x["m"] for x in v]
        per[lab] = ms
        lo, hi = bootstrap(ms)
        sh = [x["S"] / (x["S"] + x["D"] + x["I"]) for x in v]
        p(f"  {lab:30s}: median {statistics.median(ms):5.1f}  mean {sum(ms)/len(ms):5.1f} ({lo:.1f} to {hi:.1f})  "
          f"min {min(ms):5.1f}  max {max(ms):5.1f};  median S share {statistics.median(sh)*100:.0f}%; "
          f"cycles with m*_c <= 24.9: {sum(x <= MEASURED_MARGIN for x in ms)}")
    p("  m*_c per cycle (b): " + " ".join(f"{x:.1f}" for x in per["b PVG 32 orifice floor, p_n 5"]))

    # --- predictions ---
    wb = whole[("b PVG 32 orifice floor, p_n 5", 0.0)]
    wb2 = whole[("b PVG 32 orifice floor, p_n 5", 2.0)]
    t3 = wb["S"] / (wb["S"] + wb["D"] + wb["I"])
    t4 = (wb["m"] - wb2["m"]) / wb["m"]
    t5 = statistics.median(per["a floor, no drop, p_n 5"])
    p("")
    p(f"T1 {'HOLDS' if 50 <= wb['m'] <= 80 else 'REFUTED'} (whole-record m* under b in 50 to 80 bar: {wb['m']:.1f})")
    mn = min(per["b PVG 32 orifice floor, p_n 5"])
    p(f"T2 {'HOLDS' if mn > MEASURED_MARGIN else 'REFUTED'} (every cycle m*_c > 24.9 under b: min {mn:.1f})")
    p(f"T3 {'HOLDS' if t3 > 0.70 else 'REFUTED'} (S share under b > 70%: {t3*100:.1f}%)")
    p(f"T4 {'HOLDS' if t4 < 0.15 else 'REFUTED'} (2 L/min standby lowers m* under b by < 15%: {t4*100:.2f}%; "
      f"vacuous if LS is almost never still, see above)")
    p(f"T5 {'HOLDS' if t5 > 2 * SYNTH_ZERO_DROP else 'REFUTED'} (median m*_c under a > 2 x {SYNTH_ZERO_DROP}: {t5:.1f})")
    return "\n".join(out), per


if __name__ == "__main__":
    text, _ = main(sys.argv[1])
    print(text)
    with open(os.path.join(HERE, "measured_breakeven_results.txt"), "w") as fh:
        fh.write(text + "\n")
