"""Milestone 22, H73: is the half weight's step visible in the seed sets themselves? For census
degree discount at phi = 0.25 false ties per true tie (closure), recall 0.85, the share of seeds that
differ from the half weight's kappa = 0 set, at each kappa, and the same for keeping every report
and for the oracle (one-sided false ties halved, one-sided true ties kept). Copy 0's streams (the
draws run.py evaluates), every village, 100 draws. No contagion is simulated.
/usr/bin/python3.13 experiments/m22_step/seeds.py   (about a minute; writes seeds.txt, seeds.json)"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from civ_seeding import bcdj, seeding as sd  # noqa: E402

EVAL_SEED, N_RAND, RHO, PHI, MODE, W = 5, 100, 0.85, 0.25, "closure", 0.5   # milestone 6's EVAL_SEED, N_RAND
KAPPA = [0.0, 0.02, 0.05, 0.1, 0.15, 0.25, 0.5, 0.75, 1.0]


def seeds(v, b, k, kappa, w=W, recip=True, oracle=False):
    r = np.random.default_rng([EVAL_SEED, v.village, k, 7])
    return sd.rule_recall_dd(v, b, r, 1.0, "uniform", None, RHO, fp=PHI, fp_mode=MODE, recip=recip,
                             fp_joint=kappa, recip_w=w, oracle_true=oracle)


def main():
    V = bcdj.load()
    rules = {f"half k{k:g}": dict(kappa=k) for k in KAPPA}
    rules["unfiltered"] = dict(kappa=0.0, w=0.0, recip=False)
    rules["oracle k0"] = dict(kappa=0.0, oracle=True)
    rules["oracle k0.25"] = dict(kappa=0.25, oracle=True)
    diff = {x: [] for x in rules}            # per (village, draw): share of seeds not in the kappa = 0 set
    fals = {x: [] for x in rules}            # share of seeds whose seen degree includes a full-weight false tie
    for v in V:
        b = int(v.leader.sum())
        A = v.A > 0
        for k in range(N_RAND):
            base = seeds(v, b, k, 0.0)
            for x, kw in rules.items():
                m = seeds(v, b, k, **kw)
                diff[x].append(float((m & ~base).sum() / b))
                r = np.random.default_rng([EVAL_SEED, v.village, k, 7])
                _, _, seen = sd.survey_recall(v, 1.0, r, "uniform", None, RHO, fp=PHI, fp_mode=MODE,
                                              recip=kw.get("recip", True), fp_joint=kw["kappa"],
                                              recip_w=kw.get("w", W), oracle_true=kw.get("oracle", False))
                fals[x].append(float(((seen[m] == 1) & ~A[m]).any(1).mean()))
    out = {x: dict(changed=float(np.mean(diff[x])), changed_se=float(np.std(diff[x], ddof=1) / np.sqrt(len(diff[x]))),
                   seeds_with_full_false=float(np.mean(fals[x]))) for x in rules}
    lines = ["# Milestone 22, H73: seed sets of census degree discount, phi = 0.25 closure, recall 0.85, copy 0",
             f"{len(V)} villages x {N_RAND} draws; share of seeds not in the half weight's kappa = 0 set "
             "(se over village-draws); share of seeds with at least one full-weight false tie seen"]
    for x, o in out.items():
        lines.append(f"  {x:14s} changed {o['changed'] * 100:5.2f}% (se {o['changed_se'] * 100:.2f}) | "
                     f"seeds with a full-weight false tie {o['seeds_with_full_false'] * 100:5.1f}%")
    c05, c1 = out["half k0.05"]["changed"], out["half k1"]["changed"]
    h73 = bool(c05 >= 0.5 * c1)
    lines.append(f"\nH73 (seed change at kappa 0.05 at least half of that at kappa 1): {'held' if h73 else 'refuted'}; "
                 f"{c05 * 100:.2f}% against {c1 * 100:.2f}% (ratio {c05 / c1 if c1 else 0:.2f})")
    txt = "\n".join(lines) + "\n"
    open(os.path.join(HERE, "seeds.txt"), "w").write(txt)
    json.dump({"kappa": KAPPA, "rules": out, "h73": [c05, c1, h73]}, open(os.path.join(HERE, "seeds.json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
