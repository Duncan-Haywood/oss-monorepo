"""Milestone 4m, step 1: the twin's predicted power for every split of designs whose old set leaves
more than one candidate new set.

    python3 experiments/m4m_wait/analyse.py --rig opencv   # left, right; about 10 min on 4 cores
    python3 experiments/m4m_wait/analyse.py --rig tum      # fr1, fr3
    python3 experiments/m4m_wait/score.py                  # H77-H81, summary.json, wait.png

Milestone 4l's machinery (its rig_modules, sigma_hat and predict, imported unchanged) on designs
6 + 6, 5 + 6, 7 + 5 and 7 + 4, where each old set has 7, 28, 6 and 15 disjoint candidate new sets.
Same twin draws as milestones 4i and 4l (resid model, seed 20261114, 10,000 per unit), so the
per-split thresholds are computed exactly as scored there. Writes rig_<rig>.npz (per split: old and
new masks, predicted power, twin sd, real detections) and rig_<rig>.json.
LOG.md, 2026-11-15, milestone 4m planned.
"""
import argparse, importlib.util, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DESIGNS = [(6, 6), (5, 6), (7, 5), (7, 4)]


def _m4l():
    spec = importlib.util.spec_from_file_location("m4l_m", os.path.join(ROOT, "experiments", "m4l_predict", "analyse.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m4l = _m4l()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rig", choices=("opencv", "tum"), required=True)
    ap.add_argument("--draws", type=int, default=None, help="fewer draws for a quick check (not the scored run)")
    a = ap.parse_args()
    m4g, twin, twin_sets, load, results, units, m4i = m4l.rig_modules(a.rig)
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
        sig, N, p = m4l.sigma_hat(tw, twin.NPT)
        f13 = float(T[u]["f13"])
        scal["units"][u] = dict(f13=f13, rms=tw["rms"], sigma_hat=float(sig), N=N, p=p)
        for des in DESIGNS:
            row0 = D[des][(u, "S0", 1.0)]
            pr = m4l.predict(TW, TW, IDX, IDX, row0["old"], row0["new"], sig, f13)
            key = f"{u}_{des[0]}+{des[1]}"
            arrays[f"{key}_old"], arrays[f"{key}_new"] = row0["old"], row0["new"]
            for k, v in pr.items():
                arrays[f"{key}_{k}"] = v
            for name, s in [("S0", 1.0)] + [("S1", s) for s in m4l.S_PRED]:
                row = D[des][(u, name, s)]
                assert np.array_equal(row["old"], row0["old"]) and np.array_equal(row["new"], row0["new"])
                arrays[f"{key}_fired_{name}_{s}"] = row["z2_R"] > pr["qR"]
            print(a.rig, u, des, "splits", len(row0["old"]), "mean pi(±2%)",
                  round(float((pr["pi_0.98"].mean() + pr["pi_1.02"].mean()) / 2), 4), flush=True)
        del TW, G
    scal["unit_names"] = list(units)
    suffix = "" if a.draws is None else f"_quick{a.draws}"
    np.savez_compressed(os.path.join(HERE, f"rig_{a.rig}{suffix}.npz"), **arrays)
    with open(os.path.join(HERE, f"rig_{a.rig}{suffix}.json"), "w") as fh:
        json.dump(scal, fh, indent=1)


if __name__ == "__main__":
    main()
