"""Milestone 7d: what keeps a linearly unstable integrator feed-forward bounded? The integrator clip, or the episode length?

Milestone 7c found that the integrator feed-forward's linear instability is necessary for divergence but not sufficient: designs
the 11-state model calls unstable at every held-out plant (milestone 6b's `above` designs at 1.25x their ki ceiling) never
diverged in the 6 s held-out episodes. It conjectured, without testing, that the attitude integrator's clip (+-0.3 rad s) caps the
feed-forward. This script takes milestone 7c's 24 `above` integrator-mode design-conditions with the feed-forward on (bolted-on
6b+integ, 6b at 1.25x and 0.8x the ceiling, integ retrained; their stored designs and ki scales) and re-runs the 64 held-out
episodes (seed 9999) under
  clip arm   base  (integrator clip 0.3, feed-forward clip 1: milestones 6-7c)
             noint (integrator clip removed, feed-forward clip 1)
             none  (both removed)
  horizon    6 s (milestones 6-7c) and 18 s (same seed: the first draws and the four yaw signs are kept, segments are 4.5 s)
  lever      0 and 1
recording divergence, the step of divergence and the share of alive steps each saturation is active (`poshold.rollout(diag=...)`).
Separately, the linear model itself is iterated from each episode's initial offset alone (no gust, wind or noise), and the first
time it reaches |p| > 5 m or 60 deg of tilt is recorded: whether linear growth from the offset is fast enough to kill within 6 s
or 18 s.
Predictions V1-V8 in ../../LOG.md, written and committed before this was run.
"""
import json, os, sys, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import aero as A, linstab as S, poshold as P  # noqa: E402

TEST_EP, TEST_SEED, KAPPA = 64, 9999, 0.081
AMAX = np.deg2rad(80.0)
SETS = {"6b+integ": "bolted", "6b+integ, ki 1.25x ceiling": "1.25x", "6b+integ, ki 0.8x ceiling": "0.8x", "integ retrained": "retrained"}
CLIPS = {"base": (0.3, 1.0), "noint": (np.inf, 1.0), "none": (np.inf, np.inf)}
HORIZONS = {6: P.STEPS, 18: 3 * P.STEPS}
LEVERS = (0.0, 1.0)
DIAG_KEYS = ("integ_at_clip", "ffi_at_clip", "tilt_at_clip", "mix_rp")


def conditions():
    d = json.load(open(os.path.join(HERE, "..", "m7c_stab", "results.json")))
    cs = [c for c in d["conds"] if c["geom"] == "above" and c["label"] in SETS]
    return sorted(cs, key=lambda c: (list(SETS).index(c["label"]), c["seed"]))


def sizes(conds):
    x = np.array([c["x"][:12] for c in conds], float)
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    sz = A.size(L, D, AMAX * np.clip(x[:, 2], 0, 1), kappa_per_d=KAPPA, actuator="hover")
    g = P.phys_gains(x[:, 3:12]); g[:, 2] *= np.array([c["ki_scale"] for c in conds])
    return sz, g, KAPPA * D


def job(arg):
    clip, hz, lev = arg
    conds = conditions()
    sz, g, kap = sizes(conds)
    ic, fc = CLIPS[clip]
    diag = {}
    o = P.rollout(sz, g, kap, TEST_EP, TEST_SEED, dist_sign=P.cop_signs(1.0), lever_scale=lev, ff=1.0, ff_mode="integ",
                  integ_clip=ic, ffi_clip=fc, steps=HORIZONS[hz], diag=diag)
    return dict(clip=clip, hz=hz, lev=lev, dead=o["dead_ep"].astype(int).tolist(), pos=o["pos_ep"].tolist(),
                t_dead=(diag["t_dead"] * A.DT).tolist(), **{k: diag[k].tolist() for k in DIAG_KEYS})


def linear_death(conds, t_max=18.0):
    """First time (s) the linear axis map, iterated from the episode's own initial offset only, reaches |p| > 5 m or |th| > 60 deg
    on either axis; inf if not within t_max. Shape (len(conds), 64)."""
    off = P.reference(TEST_EP, TEST_SEED)[5]
    pl = A.plant_draw("wide", TEST_EP, TEST_SEED)
    out = np.full((len(conds), TEST_EP), np.inf)
    for i, c in enumerate(conds):
        dp = S.design_params(np.array([c["x"]]), ki_scale=c["ki_scale"])
        for sign, p0 in ((1.0, off[:, 0]), (-1.0, -off[:, 1])):
            q = lambda v: np.asarray(v, float)[0]
            d = dict(kp=q(dp["kp"]), kd=q(dp["kd"]), ki=q(dp["ki"]), kpp=q(dp["kpp"]), kdp=q(dp["kdp"]), kip=q(dp["kip"]),
                     lam=sign * q(dp["lat"]), tmax=q(dp["tmax"]), I=q(dp["I0"]) * pl["mass"], m=q(dp["m_nom"]) * pl["mass"],
                     m_nom=q(dp["m_nom"]), lag=q(dp["lag_nom"]) * pl["lag"], lag_nom=q(dp["lag_nom"]), tau_s=pl["tau"], ff=c["ff"],
                     mode=c["mode"], b_ff=q(dp["b_ff"]))
            M = S.matrix(d, (TEST_EP,))
            x = np.zeros((TEST_EP, S.NX)); x[:, 0] = p0
            t_hit = np.full(TEST_EP, np.inf)
            for k in range(int(round(t_max / A.DT))):
                x = np.einsum("eij,ej->ei", M, x)
                hit = (np.abs(x[:, 0]) > P.DEAD_POS) | (np.abs(x[:, 3]) > np.deg2rad(60.0))
                t_hit = np.where(hit & np.isinf(t_hit), (k + 1) * A.DT, t_hit)
            out[i] = np.minimum(out[i], t_hit)
    return out


def main():
    conds = conditions()
    args = [(c, h, l) for c in CLIPS for h in HORIZONS for l in LEVERS]
    with Pool() as p:
        outs = p.map(job, args, chunksize=1)
    lin_t = linear_death(conds)
    meta = [dict(set=SETS[c["label"]], seed=c["seed"], ki_scale=c["ki_scale"], rho_ep=c["rho_ep"], dead_7c_0=c["dead_0"], dead_7c_1=c["dead_1"]) for c in conds]
    json.dump(dict(test_ep=TEST_EP, test_seed=TEST_SEED, conds=meta, runs=outs, lin_death=np.where(np.isinf(lin_t), -1, lin_t).tolist()),
              open(os.path.join(HERE, "results.json"), "w"))
    lines = summarise(meta, outs, lin_t)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


def summarise(meta, outs, lin_t):
    R = {(o["clip"], o["hz"], o["lev"]): o for o in outs}
    unst = np.array([np.array(m["rho_ep"]) >= 1.0 for m in meta])
    L = ["Milestone 7d: milestone 7c's 24 `above` integrator-mode design-conditions (feed-forward on), 64 held-out episodes (seed 9999).",
         "dead = diverged episodes per design (of 64); t50 = median time of divergence among diverged (s); pos = median episode position RMS (m).",
         "sat shares (alive steps, median over the 6x64 episodes of a set): integ = roll/pitch attitude integrator at its clip, ffi = ki*integ",
         "at the feed-forward clip, tilt = tilt command at 20 deg, mix = mixer scaling roll/pitch. 'pred' = share of episodes the linear model calls unstable.", ""]
    L.append("V1 reproduction (base, 6 s) against milestone 7c: " + ", ".join(
        f"lever {lev:g} {'exact' if all(R[('base', 6, lev)]['dead'][i] == m[f'dead_7c_{lev:g}'] for i, m in enumerate(meta)) else 'MISMATCH'}" for lev in LEVERS))
    L.append("")
    for s in SETS.values():
        idx = [i for i, m in enumerate(meta) if m["set"] == s]
        L.append(f"[{s}] seeds {[meta[i]['seed'] for i in idx]}; pred {', '.join(f'{unst[i].mean():.2f}' for i in idx)}")
        for clip in CLIPS:
            for hz in HORIZONS:
                for lev in LEVERS:
                    o = R[(clip, hz, lev)]
                    dead = np.array([o["dead"][i] for i in idx]); td = np.array([o["t_dead"][i] for i in idx])
                    pos = np.array([o["pos"][i] for i in idx])
                    t50 = np.median(td[dead > 0]) if (dead > 0).any() else float("nan")
                    sat = " ".join(f"{k.split('_')[0]} {np.median(np.array([o[k][i] for i in idx])):.3f}" for k in DIAG_KEYS)
                    L.append(f"  {clip:5s} {hz:2d} s lever {lev:g}: dead {dead.sum(1).tolist()} (total {int(dead.sum())}, "
                             f"{dead.sum() / max(unst[idx].sum(), 1):.2f} of linear-unstable); t50 {t50:.2f}; pos {np.median(pos):.3f}; sat {sat}")
        lt = lin_t[idx]
        L.append(f"  linear model from offset only: dead by 6 s {[int((x <= 6).sum()) for x in lt]}, by 18 s {[int((x <= 18).sum()) for x in lt]}; "
                 f"of linear-unstable episodes {((lt <= 6) & unst[idx]).sum() / max(unst[idx].sum(), 1):.2f} by 6 s, {((lt <= 18) & unst[idx]).sum() / max(unst[idx].sum(), 1):.2f} by 18 s")
        L.append("")
    return L


if __name__ == "__main__":
    main()
