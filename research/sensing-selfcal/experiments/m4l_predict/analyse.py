"""Milestone 4l, step 1: the twin's predicted power for every split of one rig.

    python3 experiments/m4l_predict/analyse.py --rig opencv   # left, right; a few minutes
    python3 experiments/m4l_predict/analyse.py --rig tum      # fr1, fr3
    python3 experiments/m4l_predict/score.py                  # H73-H76, summary.json, power.png

For each (old, new) split the unit's linearised twin (milestone 4i) gives 10,000 draws of f_old,
f_new and their robust jackknife variances R. Milestone 4i's per-split threshold is the 99th
percentile of z_R^2 over those draws; here the same draws, rescaled to the unit's own residual
scale and with a focal change (s - 1) f13 added to f_new, give the twin's predicted power pi_s of
the split: the share of draws above that threshold. Nothing is fitted to the real detections,
which come from milestone 4i's (OpenCV) and 4j's (TUM) analysis code, imported unchanged.
The draws use milestone 4i's seed and chunking, so the thresholds are the ones scored there.
Writes rig_<rig>.npz (per split) and rig_<rig>.json (scalars). LOG.md, 2026-11-15, milestone 4l planned.
"""
import argparse, importlib.util, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
S_PRED = (0.96, 0.98, 0.99, 1.01, 1.02, 1.04)
DESIGNS = [(7, 4), (7, 5), (7, 6)]
BLOCK = 500


def _module(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, "experiments", rel))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def rig_modules(rig):
    """(m4g, twin, twin_sets, references, load, results path or None, units, m4i constants module)."""
    if rig == "opencv":
        m = _module("m4i_l", "m4i_geomref/analyse.py")
        return m.m4g, m.twin, m.twin_sets, m.load_cam, None, m.m4g.CAMS, m
    if rig == "tum":
        m = _module("m4j_l", "m4j_tum/analyse.py")
        return m.m4g, m.twin, m.m4i.twin_sets, m.load_unit, m.RESULTS, m.CAMS, m.m4i
    raise ValueError(rig)


def sigma_hat(tw, npt, ni=4):
    """The 13-view residual scale with the degrees-of-freedom correction: rms * sqrt(N / (N - p))."""
    nv = tw["poses"].shape[0]
    N = nv * npt * 2
    p = ni + 6 * (nv - 1) + 3 * npt - 1
    return tw["rms"] * np.sqrt(N / (N - p)), N, p


def predict(TW_old, TW_new, idx_old, idx_new, om, nm, sig, f13, q_level=0.99):
    """Per split: the twin threshold qR, the predicted power for each s in S_PRED (at scale sig and,
    reported, at the uncorrected scale is handled by the caller), and the twin's sd of f_new - f_old / f13."""
    F_o, _, R_o = TW_old
    F_n, _, R_n = TW_new
    io = np.array([idx_old[int(m)] for m in om]); inn = np.array([idx_new[int(m)] for m in nm])
    out = dict(qR=[], sd=[], **{f"pi_{s}": [] for s in S_PRED})
    for a in range(0, len(om), BLOCK):
        o, n = io[a:a + BLOCK], inn[a:a + BLOCK]
        d = F_n[n].astype(np.float64) - F_o[o]
        Ro, Rn = R_o[o].astype(np.float64), R_n[n].astype(np.float64)
        q = np.quantile(d * d / (Ro + Rn), q_level, axis=1)
        out["qR"].append(q)
        out["sd"].append(sig * d.std(1) / f13)
        for s in S_PRED:
            z = (sig * d + (s - 1) * f13) ** 2 / (sig * sig * (Ro + s * s * Rn))
            out[f"pi_{s}"].append((z > q[:, None]).mean(1))
    return {k: np.concatenate(v) for k, v in out.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rig", choices=("opencv", "tum"), required=True)
    ap.add_argument("--draws", type=int, default=None, help="fewer draws for a quick check (not the scored run)")
    a = ap.parse_args()
    m4g, twin, twin_sets, load, results, units, m4i = rig_modules(a.rig)
    n_draws = a.draws or m4i.N_DRAWS
    sols = m4g.load(results) if results else m4g.load()
    T = {u: m4g.per_set(sols[u]) for u in units}
    D = {des: m4g.decisions(T, *des) for des in DESIGNS}
    arrays, scal = {}, dict(rig=a.rig, n_draws=n_draws, units={})
    for u in units:
        tw = load(u)[0]
        assert abs(tw["intr"][0] / T[u]["f13"] - 1) < 1e-8
        G, IDX = twin.gain_matrix(tw)
        rng = np.random.default_rng([m4i.SEED, m4i.MODELS.index("resid"), units.index(u)])
        chunk = min(m4i.CHUNK, n_draws)
        parts = [twin_sets(G, IDX, twin.noise(rng, "resid", chunk, tw)) for _ in range(n_draws // chunk)]
        TW = tuple(np.concatenate([p[j] for p in parts], axis=1) for j in range(3))
        del parts
        sig, N, p = sigma_hat(tw, twin.NPT)
        f13 = float(T[u]["f13"])
        # median 6- and 7-view real f, to flag far solves (milestone 4j's 5% rule)
        f = T[u]["f"]
        med = {n: float(np.nanmedian([f[m4g.mask(v)] for v in sols[u] if len(v) == n])) for n in range(4, 8)}
        scal["units"][u] = dict(f13=f13, rms=tw["rms"], sigma_hat=float(sig), N=N, p=p, median_f=med)
        for des in DESIGNS:
            row0 = D[des][(u, "S0", 1.0)]
            pr = predict(TW, TW, IDX, IDX, row0["old"], row0["new"], sig, f13)
            pr_unc = predict(TW, TW, IDX, IDX, row0["old"], row0["new"], tw["rms"], f13)
            key = f"{u}_{des[0]}+{des[1]}"
            for k, v in pr.items():
                arrays[f"{key}_{k}"] = v
            for s in S_PRED:
                arrays[f"{key}_piunc_{s}"] = pr_unc[f"pi_{s}"]
            for name, s in [("S0", 1.0)] + [("S1", s) for s in S_PRED]:
                row = D[des][(u, name, s)]
                assert np.array_equal(row["old"], row0["old"]) and np.array_equal(row["new"], row0["new"])
                arrays[f"{key}_fired_{name}_{s}"] = row["z2_R"] > pr["qR"]
            fo, fn = f[row0["old"]], f[row0["new"]]
            arrays[f"{key}_far"] = (np.abs(fo / med[des[0]] - 1) > 0.05) | (np.abs(fn / med[des[1]] - 1) > 0.05)
            print(a.rig, u, des, "qR median", float(np.median(pr["qR"])), "mean pi(±2%)",
                  float((pr["pi_0.98"].mean() + pr["pi_1.02"].mean()) / 2),
                  "real", float((arrays[f"{key}_fired_S1_0.98"].mean() + arrays[f"{key}_fired_S1_1.02"].mean()) / 2), flush=True)
        del TW, G
    scal["unit_names"] = list(units)
    suffix = "" if a.draws is None else f"_quick{a.draws}"
    np.savez_compressed(os.path.join(HERE, f"rig_{a.rig}{suffix}.npz"), **arrays)
    with open(os.path.join(HERE, f"rig_{a.rig}{suffix}.json"), "w") as fh:
        json.dump(scal, fh, indent=1)


if __name__ == "__main__":
    main()
