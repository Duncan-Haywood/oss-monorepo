"""Milestone 4o, step 1: the twin's predicted power (milestone 4l) and the waiting rule (milestone 4m)
on the TUM units with a k1 + k2 lens model, beside the k1 arm.

    python3 experiments/m4o_k2wait/analyse.py      # ~10 min on 4 cores; then score.py

For each lens model (nk = 1: milestone 4j's stored solves; nk = 2: milestone 4n's) this builds each
unit's twin with that model (milestone 4j's analysis module, a private copy with the twin's NK set, as
milestone 4n did), draws 10,000 resid-model noise patterns per unit (seed 20261114, the same draws for
both models and as in milestones 4i-4n) and runs milestone 4l's `predict` (imported unchanged; sigma
hat counts nk lens terms) on the 7 + 6 and 6 + 6 designs, the two milestone 4n's solves cover.
Writes rig_k<nk>.npz in milestones 4l / 4m's per-split key format (unit_design_field) and rig_k<nk>.json.
LOG.md, 2026-11-15, milestone 4o planned.
"""
import argparse, gzip, importlib.util, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def _module(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, "experiments", rel))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m4l = _module("m4l_for_m4o", "m4l_predict/analyse.py")
m4n = _module("m4n_for_m4o", "m4n_k2/analyse.py")
DESIGNS = [(7, 6), (6, 6)]


def arm(nk, n_draws=None, designs=DESIGNS):
    m4j = m4n.m4j_module(nk)
    m4g, m4i, twin, tu = m4j.m4g, m4j.m4i, m4j.twin, m4n.tu
    n_draws = n_draws or m4i.N_DRAWS
    sols = m4g.load(m4n.RESULTS[nk])
    units = m4n.CAMS
    T = {u: m4g.per_set(sols[u]) for u in units}
    D = {des: m4g.decisions(T, *des) for des in designs}
    with gzip.open(m4n.RESULTS[nk], "rt") as fh:
        f0 = json.load(fh)["cams"]
    arrays, scal = {}, dict(nk=nk, n_draws=n_draws, units={})
    for u in units:
        obs, size, _ = tu.load(u)
        tw = twin.fit_all(obs, size, f0[u]["f0"])
        assert len(tw["intr"]) == 3 + nk
        assert abs(tw["intr"][0] / T[u]["f13"] - 1) < 1e-8, (nk, u, tw["intr"][0], T[u]["f13"])
        G, IDX = twin.gain_matrix(tw, sizes=range(5, 8))
        rng = np.random.default_rng([m4i.SEED, m4i.MODELS.index("resid"), units.index(u)])
        chunk = min(m4i.CHUNK, n_draws)
        parts = [m4n.twin_sets(m4g, G, IDX, twin.noise(rng, "resid", chunk, tw)) for _ in range(n_draws // chunk)]
        TW = tuple(np.concatenate([p[j] for p in parts], axis=1) for j in range(3))
        del parts, G
        sig, N, p = m4l.sigma_hat(tw, twin.NPT, ni=twin.NI)
        f13 = float(T[u]["f13"])
        scal["units"][u] = dict(f13=f13, rms=tw["rms"], sigma_hat=float(sig), N=N, p=p,
                                intr=[float(x) for x in tw["intr"]])
        for des in designs:
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
            print(f"k{nk}", u, des, "splits", len(row0["old"]), "qR median", round(float(np.median(pr["qR"])), 3),
                  "mean pi(±2%)", round(float((pr["pi_0.98"].mean() + pr["pi_1.02"].mean()) / 2), 4),
                  "real", round(float((arrays[f"{key}_fired_S1_0.98"].mean() + arrays[f"{key}_fired_S1_1.02"].mean()) / 2), 4),
                  "S0", round(float(arrays[f"{key}_fired_S0_1.0"].mean()), 4), flush=True)
        del TW
    return arrays, scal


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nk", type=int, choices=(1, 2), nargs="+", default=[1, 2])
    a = ap.parse_args()
    for nk in a.nk:
        arrays, scal = arm(nk)
        np.savez_compressed(os.path.join(HERE, f"rig_k{nk}.npz"), **arrays)
        with open(os.path.join(HERE, f"rig_k{nk}.json"), "w") as fh:
            json.dump(scal, fh, indent=1)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
