"""Milestone 5z: the pump-to-demand volume ratio r on a measured excavator, from joint motion.

Data: `fuxi-robot/excavator-motion` on Hugging Face (CC BY-NC-SA 4.0), folder `75`: ten truck-loading
trajectories, file names `xcmg_data_*` (an XCMG of the 7.5 t class by our reading of the names; the card
does not say). Each file carries `observations/qpos` (boom, arm, bucket, swing joint angles, rad),
`observations/qvel` (joint speeds) and `observations/relative_time`. Only those arrays are fetched
(hf_range.py); nothing from the dataset is committed. Predictions Z1 to Z5 were registered in LOG.md (5z)
before any folder-75 array was read.

Geometry: XCMG XE80E brochure (Europe, 2024), "Hydraulic Cylinders" (bore x rod x stroke, mm) boom
110 x 75 x 922, arm 95 x 60 x 885, bucket 85 x 55 x 742; the XE75U's dealer-listed cylinders agree within
1 mm. Pump 219 L/min at 2100 rpm (load-sensing); max swing speed 12 rpm.

Usage: python measured_excavator_flow.py [cache dir]   (default ~/.cache/heavy-hydraulics-excavator)
Needs numpy and h5py; under a minute of range reads on first run, a second after.
"""
import itertools
import math
import os
import random
import statistics
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import cylinder_flow  # noqa: E402
from hf_range import list_files, small_arrays  # noqa: E402

CYL = {"boom": (0.110, 0.075, 0.922), "arm": (0.095, 0.060, 0.885), "bucket": (0.085, 0.055, 0.742)}
Q_PUMP, W_SWING = 219.0, 12 * 2 * math.pi / 60      # L/min; rad/s
V_MOVE = 0.05                                       # rad/s, as 5y
R_SYNTH, R_LOADER, COV, P_TOP, SHARE = 1.433, 1.79, 0.78, 316.0, 0.41   # 5u, 5v, 5v, XE80E, 5y


def load(cache):
    recs = []
    for path in list_files("75"):
        d = small_arrays(path, cache)
        q, v = d["observations__qpos"].astype(float), d["observations__qvel"].astype(float)
        tn = d["observations__relative_time"][:, 0].astype(float)
        # relative_time runs 0 to 1, so the record length T comes from qvel: dq/dtn = qvel * T (least squares).
        g = np.gradient(q, tn, axis=0)
        T = float((g * v).sum() / (v * v).sum())
        recs.append({"name": os.path.basename(path), "q": q, "v": v, "T": T, "dt": T / (len(q) - 1),
                     "corr": [float(np.corrcoef(g[:, j], v[:, j])[0, 1]) for j in range(4)]})
    return recs


def demand(v, levers, signs, s_swing):
    out = np.zeros(len(v))
    for j, name in enumerate(("boom", "arm", "bucket")):
        bore, rod, _ = CYL[name]
        out += [cylinder_flow(w, levers[j], bore, rod, signs[j]) for w in v[:, j]]
    return out + s_swing * Q_PUMP * np.abs(v[:, 3]) / W_SWING


def ratio(q, dt, moving, q_pump):
    """r = pump volume over demand volume, while moving."""
    return q_pump * moving.sum() * dt / (q[moving] * dt).sum()


def case(recs, levers, signs, s_swing):
    qs = [demand(r["v"], levers, signs, s_swing) for r in recs]
    mv = [np.abs(r["v"]).max(1) > V_MOVE for r in recs]
    allq = np.concatenate([q[m] for q, m in zip(qs, mv)])
    p95, p99 = np.percentile(allq, 95), np.percentile(allq, 99)
    t_mv = sum(m.sum() * r["dt"] for m, r in zip(mv, recs))
    vol = sum((q[m] * r["dt"]).sum() for q, m, r in zip(qs, mv, recs))
    return {"p50": float(np.median(allq)), "p95": float(p95), "p99": float(p99), "mean": vol / t_mv,
            "r_stock": Q_PUMP * t_mv / vol, "r99": p99 * t_mv / vol, "r95": p95 * t_mv / vol,
            "over": float((allq > Q_PUMP).mean()), "qs": qs, "mv": mv}


def main(cache):
    recs = load(cache)
    out = []
    p = out.append
    p("Milestone 5z: volume ratio r on a measured excavator (fuxi-robot/excavator-motion, folder 75, CC BY-NC-SA 4.0)")
    p("")
    n = sum(len(r["q"]) for r in recs)
    tt = sum(r["T"] for r in recs)
    p(f"{len(recs)} files, {n} samples, {tt / 60:.1f} min; sample interval (T from qvel) "
      f"{min(r['dt'] for r in recs) * 1000:.1f} to {max(r['dt'] for r in recs) * 1000:.1f} ms")
    cs = np.array([r["corr"] for r in recs])
    p("check: corr(d qpos / d relative_time, qvel) per joint, min over files: "
      + ", ".join(f"{k} {cs[:, j].min():.3f}" for j, k in enumerate(("boom", "arm", "bucket", "swing"))))
    allq = np.concatenate([r["q"] for r in recs])
    lo, hi = np.percentile(allq, 0.1, axis=0), np.percentile(allq, 99.9, axis=0)
    rng = hi - lo
    p("observed joint span p0.1 to p99.9 (rad): " + ", ".join(
        f"{k} {lo[j]:.3f} to {hi[j]:.3f} ({rng[j]:.3f})" for j, k in enumerate(("boom", "arm", "bucket", "swing"))))
    mv_all = np.concatenate([np.abs(r["v"]).max(1) > V_MOVE for r in recs])
    p(f"moving (any joint above {V_MOVE} rad/s): {mv_all.mean() * 100:.1f}% of samples")
    allv = np.concatenate([r["v"] for r in recs])
    p("joint speed p99 (rad/s): " + ", ".join(
        f"{k} {np.percentile(np.abs(allv[:, j]), 99):.3f}" for j, k in enumerate(("boom", "arm", "bucket", "swing")))
      + f"; swing p99 is {np.percentile(np.abs(allv[:, 3]), 99) / W_SWING:.2f} of the 12 rpm maximum")
    p("")
    signs_all = list(itertools.product((1, -1), repeat=3))
    rows = {}
    for f_rng in (1.0, 1.25, 1.5):
        levers = [CYL[k][2] / (rng[j] * f_rng) for j, k in enumerate(("boom", "arm", "bucket"))]
        for s_sw in (0.0, 0.5, 1.0):
            for sg in signs_all:
                rows[(f_rng, s_sw, sg)] = case(recs, levers, sg, s_sw)
    p("lever k = stroke / (span x f); central f 1.0, swing share s 0.5. Per (f, s): min to max over the 8 sign assignments")
    p(f"{'f':>5} {'s':>4} | {'p50 L/min':>13} {'p99 L/min':>13} {'>219':>11} | {'r stock':>11} {'r p99':>11} {'r p95':>11}")
    for f_rng in (1.0, 1.25, 1.5):
        for s_sw in (0.0, 0.5, 1.0):
            g = [rows[(f_rng, s_sw, sg)] for sg in signs_all]

            def mm(key, fmt):
                a = [x[key] for x in g]
                return f"{fmt.format(min(a))}-{fmt.format(max(a))}"
            p(f"{f_rng:>5.2f} {s_sw:>4.1f} | {mm('p50', '{:.0f}'):>13} {mm('p99', '{:.0f}'):>13} "
              f"{mm('over', '{:.3f}'):>11} | {mm('r_stock', '{:.2f}'):>11} {mm('r99', '{:.2f}'):>11} {mm('r95', '{:.2f}'):>11}")
    p("")
    cen = [rows[(1.0, 0.5, sg)] for sg in signs_all]
    c99 = [x["r99"] for x in cen]
    c99_all = [x["r99"] for x in rows.values()]
    cst_all = [x["r_stock"] for x in rows.values()]
    p(f"central (f 1, s 0.5), 8 sign assignments: p99 demand {min(x['p99'] for x in cen):.0f} to {max(x['p99'] for x in cen):.0f} L/min; "
      f"r stock {min(x['r_stock'] for x in cen):.2f} to {max(x['r_stock'] for x in cen):.2f}; r p99 {min(c99):.3f} to {max(c99):.3f} (max/min {max(c99) / min(c99):.3f})")
    p(f"all 72 cases: r stock {min(cst_all):.2f} to {max(cst_all):.2f}; r p99 {min(c99_all):.2f} to {max(c99_all):.2f}")
    # per-file r at the pooled p99 pump, central geometry, signs from the dataset's kinematics (boom -1, arm +1,
    # bucket +1; see below), bootstrap over files
    mid = rows[(1.0, 0.5, (-1, 1, 1))]
    per = []
    for q, m, r in zip(mid["qs"], mid["mv"], recs):
        per.append(ratio(q, r["dt"], m, mid["p99"]))
    rngb = random.Random(0)
    bs = sorted(statistics.mean(rngb.choice(per) for _ in per) for _ in range(4000))
    p(f"per file, r at that pooled p99 pump ({mid['p99']:.0f} L/min, central, kinematic signs): "
      f"{min(per):.2f} to {max(per):.2f}, mean {statistics.mean(per):.2f}, 95% bootstrap over files {bs[100]:.2f} to {bs[3899]:.2f}")
    p("")
    p_load = SHARE * P_TOP
    p(f"5u rule m* ~ {COV} (r - 1) p, p = {SHARE} x {P_TOP:.0f} = {p_load:.0f} bar (5y share on this machine's maximum):")
    for lab, rv in (("synthetic r", R_SYNTH), ("loader r", R_LOADER), ("r p99, central min", min(c99)),
                    ("r p99, central max", max(c99)), ("r p99, all cases min", min(c99_all)),
                    ("r stock, central min", min(x["r_stock"] for x in cen))):
        p(f"  {lab:<22} r {rv:.2f}: m* ~ {COV * (rv - 1) * p_load:.1f} bar")
    p("")
    # Not registered: the dataset's own scripts/visualize.py forward kinematics for excavator '75' put the boom
    # at (boom + 1.0) rad from vertical (a larger boom angle lowers it: boom cylinder retracts) and the arm
    # direction at pi - boom - 1.0 - arm - 1.5 (a larger arm angle swings the arm in: arm cylinder extends).
    # The bucket is not in that script, so its sign stays open.
    fk = [sg for sg in signs_all if sg[0] == -1 and sg[1] == 1]
    p("Sign from the dataset's forward kinematics (scripts/visualize.py): boom -1, arm +1, bucket either")
    for sg in fk:
        x = rows[(1.0, 0.5, sg)]
        p(f"  bucket {sg[2]:+d}: p50 {x['p50']:.0f}, p99 {x['p99']:.0f} L/min, r p99 {x['r99']:.2f}, r p95 {x['r95']:.2f}")
    # common lever scale that brings p99 demand to the pump's 219 L/min (the pump caps the summed flow)
    for sg in fk:
        base = case(recs, [CYL[k][2] / rng[j] for j, k in enumerate(("boom", "arm", "bucket"))], sg, 0.0)
        p(f"  bucket {sg[2]:+d}, swing 0: p99 cylinder demand {base['p99']:.1f} L/min, so the spans would have to be "
          f"{base['p99'] / Q_PUMP:.2f} times the observed ones for the p99 to sit at the pump maximum")
    # independent per-joint lever factors (relative levers are what the scale-free ratios depend on)
    fs = (1.0, 1.5, 2.0, 2.5)
    r99_fk, r95_fk = [], []
    for fb, fa, fu in itertools.product(fs, repeat=3):
        lev = [CYL["boom"][2] / (rng[0] * fb), CYL["arm"][2] / (rng[1] * fa), CYL["bucket"][2] / (rng[2] * fu)]
        for sg in fk:
            for s_sw in (0.0, 0.5, 1.0):
                x = case(recs, lev, sg, s_sw)
                r99_fk.append(x["r99"])
                r95_fk.append(x["r95"])
    p(f"  per-joint lever factors 1 to 2.5 each (64 combinations) x bucket sign x swing share 0/0.5/1 ({len(r99_fk)} cases): "
      f"r p99 {min(r99_fk):.2f} to {max(r99_fk):.2f} (median {statistics.median(r99_fk):.2f}), "
      f"r p95 {min(r95_fk):.2f} to {max(r95_fk):.2f}")
    p(f"  m* ~ {COV} (r - 1) x {p_load:.0f} bar at the lowest r p99 there: {COV * (min(r99_fk) - 1) * p_load:.1f} bar; "
      f"at the lowest r p95: {COV * (min(r95_fk) - 1) * p_load:.1f} bar")
    p("")
    p("Predictions (LOG.md 5z):")
    z1 = all(60 <= x["p99"] <= 219 for x in cen)
    p(f"  Z1 p99 demand 60 to 219 L/min, central, every sign: {'held' if z1 else 'refuted'} "
      f"({min(x['p99'] for x in cen):.0f} to {max(x['p99'] for x in cen):.0f})")
    z2 = all(x["r_stock"] > R_LOADER for x in rows.values() if x is not None and True)
    z2c = all(rows[(1.0, s, sg)]["r_stock"] > R_LOADER for s in (0.0, 0.5, 1.0) for sg in signs_all)
    p(f"  Z2 r stock > {R_LOADER} under every sign and swing share (f 1): {'held' if z2c else 'refuted'}; over all f: {'yes' if z2 else 'no'}")
    z3 = all(R_SYNTH <= x <= 2.5 for x in c99)
    p(f"  Z3 r p99 within {R_SYNTH} to 2.5, central: {'held' if z3 else 'refuted'} ({min(c99):.2f} to {max(c99):.2f})")
    z4 = max(c99) / min(c99) < 1.15
    p(f"  Z4 sign moves r p99 by under 15%: {'held' if z4 else 'refuted'} ({(max(c99) / min(c99) - 1) * 100:.1f}%)")
    z5 = COV * (min(c99) - 1) * p_load > 25
    p(f"  Z5 m* at r p99 (central min) > 25 bar: {'held' if z5 else 'refuted'} ({COV * (min(c99) - 1) * p_load:.1f} bar)")
    p("")
    p("Source: fuxi-robot/excavator-motion, https://huggingface.co/datasets/fuxi-robot/excavator-motion, CC BY-NC-SA 4.0. "
      "Derived statistics only; no data redistributed.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
