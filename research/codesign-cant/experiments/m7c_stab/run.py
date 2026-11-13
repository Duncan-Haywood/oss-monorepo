"""Milestone 7c: does a linear stability test predict which designs and episodes the side-force feed-forward makes diverge?

`codesign_cant.linstab` linearises one horizontal axis of `poshold.rollout` around hover (11 states; tests/test_linstab.py checks it
against rollout to 1e-3). Here:
  (a) for milestone 7b's design-conditions (6b aware with the feed-forward off and on, integ retrained with it on and off) and
      milestone 7's retrained commanded-torque designs, the spectral radius at each held-out episode's own plant draw (seed 9999,
      64 episodes), against that episode's divergence in a re-run of the held-out rollout at lever 0 and 1;
  (b) the ki ceiling (largest multiple of the design's attitude ki stable at all eight plant corners, both axes) per design;
  (c) out of sample: milestone 6b's 12 force-aware designs with the integrator feed-forward on and ki set to 0.8x and 1.25x their
      own ceiling, held-out rollouts at lever 0 and 1.
Predictions U1-U6 in ../../LOG.md, written and committed before this was run.
"""
import json, os, sys, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import aero as A, linstab as S, poshold as P  # noqa: E402

GEOMS = {"above": P.cop_signs(1.0), "below": P.cop_signs(-1.0)}
TEST_EP, TEST_SEED, KAPPA = 64, 9999, 0.081
LEVERS = (0.0, 1.0)
AMAX = np.deg2rad(80.0)


def rollout_dead(x, geom, lever, ff, mode, ki_scale=1.0):
    """Per-episode divergence (64,) of one design on the held-out set, as `poshold.score` builds it, with ki optionally scaled."""
    x = np.atleast_2d(np.asarray(x, float))
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    sz = A.size(L, D, AMAX * np.clip(x[:, 2], 0, 1), kappa_per_d=KAPPA, actuator="hover")
    g = P.phys_gains(x[:, 3:12]); g[:, 2] *= ki_scale
    tau_ff = P.TAU_FF_RANGE[0] * (P.TAU_FF_RANGE[1] / P.TAU_FF_RANGE[0]) ** np.clip(x[:, 12], 0, 1) if x.shape[1] == 13 else P.TAU_FF
    o = P.rollout(sz, g, KAPPA * D, TEST_EP, TEST_SEED, dist_sign=GEOMS[geom], lever_scale=lever, ff=ff, tau_ff=tau_ff, ff_mode=mode)
    return o["dead_ep"][0], o["pos_ep"][0]


def job(c):
    out = {}
    for lev in LEVERS:
        d, p = rollout_dead(c["x"], c["geom"], lev, c["ff"], c["mode"], c["ki_scale"])
        out[f"dead_{lev:g}"] = d.astype(int).tolist(); out[f"pos_{lev:g}"] = p.tolist()
    return out


def lin(c, plant):
    dp = S.design_params(np.array([c["x"]]), ki_scale=c["ki_scale"])
    t, m, l = plant
    rp = S.radius(dp, t, m, l, c["ff"], c["mode"], 1.0)[0]
    rr = S.radius(dp, t, m, l, c["ff"], c["mode"], -1.0)[0]
    return np.maximum(rp, rr)


def main():
    runs7b = json.load(open(os.path.join(HERE, "..", "m7b_integ", "results.json")))["runs"]
    runs7 = json.load(open(os.path.join(HERE, "..", "m7_ff", "results.json")))["runs"]
    conds = []
    for r in runs7b:
        if r["label"] in ("6b aware", "6b+integ", "integ retrained", "integ retrained, ff off"):
            conds.append(dict(set="7b", label=r["label"], geom=r["geom"], seed=r["seed"], x=r["x"], ff=r["ff"], mode="integ", ki_scale=1.0))
    for r in runs7:
        if r["label"] == "ff retrained":
            conds.append(dict(set="7", label="m7 cmd-ff", geom=r["geom"], seed=r["seed"], x=r["x"], ff=1.0, mode="cmd", ki_scale=1.0))
    # (b) ceilings for the integrator-mode designs (feed-forward on) and the cmd designs
    for c in conds:
        dp = S.design_params(np.array([c["x"]]))
        c["kp"], c["ki_kp"] = float(dp["kp"][0]), float(dp["ki"][0] / dp["kp"][0])
        c["ceil"] = float(S.ki_ceiling(dp, 1.0, c["mode"])[0])
        c["stable_corners_off"] = bool(S.worst_radius(dp, 0.0, "integ")[0] < 1.0)
        c["worst_rho"] = float(S.worst_radius(dp, c["ff"], c["mode"])[0])
    # (c) out of sample: 6b aware designs, integrator feed-forward on, ki at 0.8x and 1.25x the ceiling
    base = [c for c in conds if c["label"] == "6b aware"]
    for c in base:
        for mult in (0.8, 1.25):
            if c["ceil"] <= 0 or c["ceil"] >= 4.0:
                continue
            n = dict(c, set="new", label=f"6b+integ, ki {mult}x ceiling", ff=1.0, mode="integ", ki_scale=c["ceil"] * mult, mult=mult)
            dp = S.design_params(np.array([n["x"]]), ki_scale=n["ki_scale"])
            n["worst_rho"] = float(S.worst_radius(dp, 1.0, "integ")[0])
            conds.append(n)
    plant = A.plant_draw("wide", TEST_EP, TEST_SEED)
    pl = (plant["tau"], plant["mass"], plant["lag"])
    for c in conds:
        c["rho_ep"] = lin(c, pl).tolist()
    with Pool() as p:
        outs = p.map(job, conds, chunksize=1)
    for c, o in zip(conds, outs):
        c.update(o)
    json.dump(dict(test_ep=TEST_EP, test_seed=TEST_SEED, levers=LEVERS, conds=conds), open(os.path.join(HERE, "results.json"), "w"), indent=0)
    lines = summarise(conds)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


FAIL_POS = 0.3


def confusion(cs, lev, outcome="dead"):
    tp = fp = fn = tn = 0
    for c in cs:
        u = np.array(c["rho_ep"]) >= 1.0
        d = np.array(c[f"dead_{lev:g}"]) > 0 if outcome == "dead" else np.array(c[f"pos_{lev:g}"]) > FAIL_POS
        tp += int((u & d).sum()); fp += int((u & ~d).sum()); fn += int((~u & d).sum()); tn += int((~u & ~d).sum())
    n = tp + fp + fn + tn
    return tp, fp, fn, tn, (tp + tn) / max(n, 1), tp / max(tp + fn, 1)


def summarise(conds):
    f = lambda v: ", ".join(f"{x:.2f}" for x in v)
    L = ["Milestone 7c: linear stability (spectral radius rho of the 11-state linearised axis map, worst of the two axes) against held-out divergence.",
         f"Held-out {TEST_EP} episodes (seed {TEST_SEED}), each with its own plant draw; 'unstable' = rho >= 1 at that episode's plant.",
         "ceil = largest multiple of the design's attitude ki stable at all 8 plant corners and both axes (4.00 = still stable at 4x; 0 = unstable at ki 0).",
         "pred = share of held-out plants with rho >= 1; dead L0/L1 = diverged held-out episodes at lever 0 / 1 (of 64).", ""]
    order = ["6b aware", "6b+integ", "integ retrained", "integ retrained, ff off", "m7 cmd-ff", "6b+integ, ki 0.8x ceiling", "6b+integ, ki 1.25x ceiling"]
    for g in GEOMS:
        for lab in order:
            cs = sorted((c for c in conds if c["geom"] == g and c["label"] == lab), key=lambda c: c["seed"])
            if not cs:
                continue
            pred = [float(np.mean(np.array(c["rho_ep"]) >= 1.0)) for c in cs]
            L.append(f"[{g}, {lab}] ff {cs[0]['ff']:g} ({cs[0]['mode']})")
            L.append(f"  ki/kp {f([c['ki_kp'] * c['ki_scale'] for c in cs])}; ceil {f([c['ceil'] for c in cs])}; ceiling ki/kp {f([c['ki_kp'] * c['ceil'] for c in cs])}")
            wr = ", ".join(f"{c['worst_rho']:.4f}" for c in cs); mr = ", ".join(f"{max(c['rho_ep']):.4f}" for c in cs)
            L.append(f"  worst-corner rho {wr}; max rho over held-out plants {mr}")
            L.append(f"  pred {f(pred)}; dead L0 {[sum(c['dead_0']) for c in cs]}; dead L1 {[sum(c['dead_1']) for c in cs]}")
            gr = f([float(S.growth_rate(max(c["rho_ep"]))) for c in cs]); mp = f([float(np.median(c["pos_0"])) for c in cs])
            L.append(f"  growth rate at worst held-out plant (1/s) {gr}; median episode pos RMS at lever 0 (m) {mp}")
        L.append("")
    integ = [c for c in conds if c["set"] == "7b"]
    for lev in LEVERS:
        tp, fp, fn, tn, acc, sens = confusion(integ, lev)
        L.append(f"7b design-conditions (48 x 64), lever {lev:g}: unstable&dead {tp}, unstable&alive {fp}, stable&dead {fn}, stable&alive {tn}; accuracy {acc:.3f}, sensitivity {sens:.3f}")
    for lev in LEVERS:
        tp, fp, fn, tn, acc, sens = confusion([c for c in conds if c["set"] == "7"], lev)
        L.append(f"m7 cmd-ff designs (12 x 64), lever {lev:g}: unstable&dead {tp}, unstable&alive {fp}, stable&dead {fn}, stable&alive {tn}; accuracy {acc:.3f}, sensitivity {sens:.3f}")
    for lev in LEVERS:
        tp, fp, fn, tn, acc, sens = confusion([c for c in conds if c["set"] == "new"], lev)
        L.append(f"new rescaled designs (24 x 64), lever {lev:g}: unstable&dead {tp}, unstable&alive {fp}, stable&dead {fn}, stable&alive {tn}; accuracy {acc:.3f}, sensitivity {sens:.3f}")
    L.append("")
    L.append(f"Post hoc (written after the first full run was read): 'failed hold' = episode position RMS > {FAIL_POS} m (3x the typical 0.10 m), dead or not.")
    for name, sel in (("7b", lambda c: c["set"] == "7b"), ("m7 cmd-ff", lambda c: c["set"] == "7"), ("new rescaled", lambda c: c["set"] == "new")):
        for lev in LEVERS:
            tp, fp, fn, tn, acc, sens = confusion([c for c in conds if sel(c)], lev, "pos")
            L.append(f"  {name}, lever {lev:g}: unstable&failed {tp}, unstable&held {fp}, stable&failed {fn}, stable&held {tn}; accuracy {acc:.3f}, sensitivity {sens:.3f}")
    L.append("")
    worst = max((float(np.mean(np.array(c["rho_ep"]) >= 1.0)) - float(np.mean(c["dead_1"])), c["label"], c["geom"], c["seed"]) for c in conds)
    L.append(f"U6 check: largest (pred - observed share at lever 1) over all design-conditions: {worst[0]:+.3f} ({worst[1]}, {worst[2]}, seed {worst[3]})")
    return L


if __name__ == "__main__":
    main()
