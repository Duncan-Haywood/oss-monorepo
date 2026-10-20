"""Fixed generators scored by the reference detector, for scale.

Writes results/baselines.json: reference AUROC and copy rate for the naive
bot, a hand-tuned kinematic generator, the best of 100 random generators from
the hand-written components only, and template replays at several retrieval
tolerances.
"""
import copy
import json
import os

import run  # first: sets one thread per process

import numpy as np  # noqa: E402

import game as G  # noqa: E402
import programs as P  # noqa: E402

KINEMATIC = {
    "dur": {"kind": "fitts", "a": 250.0, "b": 120.0, "sd": 0.5},
    "path": {"kind": "arc", "curv": 0.1, "tmix": 0.0, "tol": 45.0},
    "profile": {"kind": "skew", "peak": 0.4},
    "sub": {"kind": "undershoot", "mag": 0.08, "prob": 0.6, "frac": 0.9},
    "noise": {"kind": "smooth", "sd": 1.5, "rho": 0.8},
    "clock": {"kind": "poll", "dt": 9.0, "cv": 0.6},
    "round": {"kind": "yes"},
}
REPLAY = {
    "dur": {"kind": "template", "a": 300.0, "b": 100.0, "sd": 0.3},
    "path": {"kind": "template", "curv": 0.1, "tmix": 0.0, "tol": 45.0},
    "profile": {"kind": "uniform", "peak": 0.5},
    "sub": {"kind": "none", "mag": 0.1, "prob": 0.5, "frac": 0.9},
    "noise": {"kind": "none", "sd": 1.0, "rho": 0.8},
    "clock": {"kind": "template", "dt": 10.0, "cv": 0.3},
    "round": {"kind": "yes"},
}
HAND_WRITTEN = {g: [k for k in s["kinds"] if k not in ("template", "empirical")]
                for g, s in P.GENES.items()}


def random_kinematic(rng):
    g = {}
    for gene, spec in P.GENES.items():
        g[gene] = {"kind": str(rng.choice(HAND_WRITTEN[gene]))}
        for p, (lo, hi) in spec["params"].items():
            g[gene][p] = float(rng.uniform(lo, hi))
    return g


def main():
    pool, test, copyref = run.split()
    P.set_human(pool)
    run.setup_copy(pool, copyref)
    ref, tst = run.fixed_sets(pool, test)
    fref, ftst = P.features(ref), P.features(tst)

    def score(genome):
        a, _ = run.reference_auroc(genome, ref, tst, fref, ftst)
        return {"reference": a, "copy_rate": G.copy_rate(G.imitate(genome, tst, 202))}

    out = {"naive": score(P.NAIVE), "hand-tuned kinematic": score(KINEMATIC)}
    rng = np.random.default_rng(5)
    best = None
    for _ in range(100):
        r = score(random_kinematic(rng))
        if best is None or r["reference"] < best["reference"]:
            best = r
    out["best of 100 random kinematic"] = best
    for tol in (45, 20, 10, 3):
        for mix in (0.0, 0.3):
            g = copy.deepcopy(REPLAY)
            g["path"]["tol"], g["path"]["tmix"] = float(tol), mix
            out[f"template replay, tol {tol} deg, mix {mix}"] = score(g)
    out["held-out people (copy rate only)"] = {"copy_rate": G.copy_rate(tst)}
    with open(os.path.join(run.RES, "baselines.json"), "w") as f:
        json.dump(out, f, indent=1)
    for k, v in out.items():
        print(f"{k:42s} " + " ".join(f"{a} {b:.3f}" for a, b in v.items()))


if __name__ == "__main__":
    main()
