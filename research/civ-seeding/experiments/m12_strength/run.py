"""Milestone 12, part B: does the survey's seeding advice survive recall that falls with tie strength?

Milestone 11's harness unchanged (milestone 6's joint bootstrap, B = 500, S = 100, 100 draws per
randomised rule; milestone 10's nine and milestone 11's twelve rules kept), with nine rules whose
surveys forget ties at a per-tie rate set by the tie's strength stratum (s6 = how many of six
other survey questions name the pair: 0, 1, 2+), from part A (`strength.json`):

- measured: rho_h = part A's three-question recall in stratum h (mean of the two lists);
- matched: one uniform rho = the tie-weighted mean of rho_h over the model's ties;
- stress: rho_0 halved, the other strata as measured.

Rules per setting: census top degree, census degree discount, adaptive-dd-0.5-s0.75. Tests H27-H29.
Plan in LOG.md (2026-11-17, milestone 12), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m12_strength/run.py   (about 20 minutes on 4 cores)
"""
import functools
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from civ_seeding import bcdj, seeding as sd  # noqa: E402

_spec = importlib.util.spec_from_file_location("m11", os.path.join(HERE, "..", "m11_recall", "run.py"))
m11 = importlib.util.module_from_spec(_spec)
sys.modules["m11"] = m11
_spec.loader.exec_module(m11)
m6, m10 = m11.m6, m11.m10

PA = json.load(open(os.path.join(HERE, "strength.json")))
RHO_H = np.array(PA["rho_strata"])
SETTINGS = {"measured": RHO_H, "matched": np.full(3, PA["matched"]),
            "stress": np.array([RHO_H[0] / 2, RHO_H[1], RHO_H[2]])}
H = bcdj.tie_strata(bcdj.load())   # village id -> stratum matrix, -1 off the ties (inherited by workers)


def _P(v, setting):
    h = H[v.village]
    return np.where(h >= 0, SETTINGS[setting][np.maximum(h, 0)], 0.0)


def _deg(v, b, r, f, design, split, setting):
    return sd.rule_recall_degree(v, b, r, f, design, split, _P(v, setting))


def _dd(v, b, r, f, design, split, setting):
    return sd.rule_recall_dd(v, b, r, f, design, split, _P(v, setting))


def rules_at(t):
    return {f"census-degree-{t}": functools.partial(_deg, f=1.0, design="uniform", split=None, setting=t),
            f"census-dd-{t}": functools.partial(_dd, f=1.0, design="uniform", split=None, setting=t),
            f"adaptive-dd-0.5-s0.75-{t}": functools.partial(_dd, f=0.5, design="adaptive", split=0.75, setting=t)}


NEW = {}
for t in SETTINGS:
    NEW.update(rules_at(t))
m6.EXTRA_RANDOMISED = {**m10.EXTRA, **m11.NEW, **NEW}
m6.OUT_DIR = HERE
BASES = ("census-degree", "census-dd", "adaptive-dd-0.5-s0.75")
PERFECT = {"census-degree": "degree", "census-dd": "dd-0.05", "adaptive-dd-0.5-s0.75": "adaptive-dd-0.5-s0.75"}


def main():
    r = m6.main()
    rules, joint = r["rules"], r["joint"]
    w = joint.max(1)
    k = {c: rules.index(c) for c in rules}
    best = np.argmin(w, 1)
    med = {c: float(np.median(w[:, k[c]])) for c in rules}

    def share(a, b_):
        return float((w[:, k[a]] < w[:, k[b_]]).mean())
    lines = []
    p = lines.append
    p("# Milestone 12: seeding rules under recall that falls with tie strength, milestone 6's joint bootstrap")
    p(f"B = {w.shape[0]} joint draws; worst-case regret over I, T, R; recall by s6 stratum 0 / 1 / 2+: "
      + "; ".join(f"{t} " + " / ".join(f"{x:.3f}" for x in SETTINGS[t]) for t in SETTINGS)
      + f"; reference set = milestone 6's 23 rules + milestone 10's 9 + milestone 11's {len(m11.NEW)} + {len(NEW)}")
    p("\n## rule per setting: point fit | joint median [5%, 95%] | share of draws: beats perfect-recall census top degree / minimax")
    for base in BASES:
        for t, c in [("perfect", PERFECT[base]), ("uniform 0.85", m11.name(base, 0.85))] \
                + [(t, f"{base}-{t}") for t in SETTINGS]:
            a, lo, hi = np.percentile(w[:, k[c]], [50, 5, 95])
            p(f"  {base:22s} {t:12s} ({c:32s}) {r['worst0'][k[c]]:.3f} | {a:.3f} [{lo:.3f}, {hi:.3f}] | "
              f"{share(c, 'degree'):.3f} / {(best == k[c]).mean():.3f}")
    p("\n## milestone 11 rows re-drawn (sanity: within about 0.4 point of m11_recall/verdicts.txt)")
    for c in m11.NEW:
        a, lo, hi = np.percentile(w[:, k[c]], [50, 5, 95])
        p(f"  {c:28s} {r['worst0'][k[c]]:.3f} | {a:.3f} [{lo:.3f}, {hi:.3f}]")
    p("\n## median regret per family, joint draws")
    for c in NEW:
        p(f"  {c:32s} " + "  ".join(f"{f} {np.median(joint[:, fi, k[c]]):.3f}" for fi, f in enumerate(m6.FAMS)))
    p("\n## paired: share of joint draws where the first rule's worst case is lower")
    for base in BASES:
        p(f"  {base}-measured vs {base}-matched: {share(f'{base}-measured', f'{base}-matched'):.3f}")
        p(f"  {base}-stress vs {base}-measured: {share(f'{base}-stress', f'{base}-measured'):.3f}")
    for t in SETTINGS:
        p(f"  census-dd-{t} vs census-degree-{t}: {share(f'census-dd-{t}', f'census-degree-{t}'):.3f}")
        p(f"  adaptive-dd-0.5-s0.75-{t} vs census-degree-{t}: "
          f"{share(f'adaptive-dd-0.5-s0.75-{t}', f'census-degree-{t}'):.3f}")

    c27 = "adaptive-dd-0.5-s0.75-measured"
    h27 = med[c27] <= 0.025 and share(c27, "degree") >= 0.9
    d28 = {b_: med[f"{b_}-measured"] - med[f"{b_}-matched"] for b_ in ("census-dd", "adaptive-dd-0.5-s0.75")}
    h28 = all(abs(x) <= 0.005 for x in d28.values())
    h29v = share("census-dd-stress", "degree")
    h29 = h29v >= 0.9
    p(f"\nH27 ({c27} joint median <= 2.5% and below perfect-recall census top degree in >= 90% of draws): "
      f"{'held' if h27 else 'refuted'}; median {med[c27]:.4f}, share {share(c27, 'degree'):.3f}")
    p("H28 (measured and matched joint medians within 0.5 point for census dd and the s0.75 survey): "
      f"{'held' if h28 else 'refuted'}; " + ", ".join(f"{b_} {x:+.4f}" for b_, x in d28.items()))
    p(f"H29 (census dd under stress beats perfect-recall census top degree in >= 90% of draws): "
      f"{'held' if h29 else 'refuted'}; {h29v:.3f}")
    p("prediction (not tested): top degree barely moves: "
      + ", ".join(f"{t} {med[f'census-degree-{t}']:.4f}" for t in SETTINGS) + f" (perfect {med['degree']:.4f})")
    txt = "\n".join(lines) + "\n"
    out = "smoke_verdicts" if m6.SMOKE else "verdicts"
    open(os.path.join(HERE, out + ".txt"), "w").write(txt)
    json.dump({"settings": {t: SETTINGS[t].tolist() for t in SETTINGS},
               "worst_joint_q": {c: np.percentile(w[:, k[c]], [5, 50, 95]).round(5).tolist()
                                 for c in list(NEW) + list(PERFECT.values())},
               "worst_point": {c: round(float(r["worst0"][k[c]]), 5) for c in list(NEW) + list(PERFECT.values())},
               "h27": [med[c27], share(c27, "degree")], "h28": d28, "h29": h29v},
              open(os.path.join(HERE, out + ".json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
