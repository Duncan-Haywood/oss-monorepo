"""Milestone 10: does milestone 9's adaptive-survey degree discount stay close to a census when
the fitted parameters are uncertain, and does the half-and-half survey split matter?

Runs milestone 6's joint village bootstrap unchanged (same grid, seeds, refits and scoring) with
nine survey rules added as randomised rules (`m6.EXTRA_RANDOMISED`, 100 draws each, independent
runs on their own random streams so milestone 6's rows are untouched), then tests H19-H21.
Milestone 6's tables, with the new rows, go to `results.txt`; the tests to `verdicts.txt`.
Plan in LOG.md (2026-11-16, milestone 10), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m10_survey_uncertainty/run.py   (about 20 minutes on 4 cores)
"""
import functools
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from civ_seeding import seeding as sd  # noqa: E402

_spec = importlib.util.spec_from_file_location("m6", os.path.join(HERE, "..", "m6_uncertainty", "run.py"))
m6 = importlib.util.module_from_spec(_spec)
sys.modules["m6"] = m6            # so the worker pool can pickle m6's functions
_spec.loader.exec_module(m6)


def _rule(design, kind, f, split=None):
    if kind == "deg":
        return functools.partial(_deg, f=f, design=design, split=split)
    return functools.partial(_dd, f=f, design=design, split=split)


def _deg(v, b, r, f, design, split):
    return sd.rule_design_degree(v, b, r, f, design, split)


def _dd(v, b, r, f, design, split):
    return sd.rule_design_dd(v, b, r, f, design, split=split)


EXTRA = {
    "uniform-dd-0.25": _rule("uniform", "dd", 0.25),
    "adaptive-deg-0.25": _rule("adaptive", "deg", 0.25),
    "adaptive-dd-0.25": _rule("adaptive", "dd", 0.25),
    "adaptive-dd-0.25-s0.25": _rule("adaptive", "dd", 0.25, 0.25),
    "adaptive-dd-0.25-s0.75": _rule("adaptive", "dd", 0.25, 0.75),
    "uniform-dd-0.5": _rule("uniform", "dd", 0.5),
    "adaptive-dd-0.5": _rule("adaptive", "dd", 0.5),
    "adaptive-dd-0.5-s0.25": _rule("adaptive", "dd", 0.5, 0.25),
    "adaptive-dd-0.5-s0.75": _rule("adaptive", "dd", 0.5, 0.75),
}
m6.EXTRA_RANDOMISED = EXTRA
m6.OUT_DIR = HERE
NEW = list(EXTRA)
SPLITS = {f: {0.25: f"adaptive-dd-{f}-s0.25", 0.5: f"adaptive-dd-{f}", 0.75: f"adaptive-dd-{f}-s0.75"}
          for f in ("0.25", "0.5")}


def main():
    r = m6.main()
    rules, joint = r["rules"], r["joint"]
    w = joint.max(1)                                   # B x rules worst case over I, T, R
    B = w.shape[0]
    k = {name: rules.index(name) for name in rules}
    kdd, kdeg = k["dd-0.05"], k["degree"]
    best = np.argmin(w, 1)
    med = {c: float(np.median(w[:, k[c]])) for c in rules}
    lines = []
    p = lines.append
    p("# Milestone 10: survey rules under milestone 6's joint bootstrap")
    p(f"B = {B} joint draws; worst-case regret over I, T, R; reference set = milestone 6's 23 rules + {len(NEW)} survey rules")
    p("('survey-degree-0.25' is milestone 6's uniform quarter survey ranked by estimated degree, i.e. uniform-deg-0.25)")
    p("\n## rule: point fit | joint median [5%, 95%] | share of draws: beats census top degree / beats census dd-0.05 / minimax")
    for c in NEW + ["survey-degree-0.25", "dd-0.05", "degree", "greedy-T"]:
        a, lo, hi = np.percentile(w[:, k[c]], [50, 5, 95])
        p(f"  {c:23s} {r['worst0'][k[c]]:.3f} | {a:.3f} [{lo:.3f}, {hi:.3f}] | "
          f"{(w[:, k[c]] < w[:, kdeg]).mean():.3f} / {(w[:, k[c]] < w[:, kdd]).mean():.3f} / {(best == k[c]).mean():.3f}")
    p("\n## median regret per family, joint draws")
    for c in NEW + ["survey-degree-0.25", "dd-0.05", "degree"]:
        p(f"  {c:23s} " + "  ".join(f"{f} {np.median(joint[:, fi, k[c]]):.3f}" for fi, f in enumerate(m6.FAMS)))
    p("\n## family of the worst case (share of draws)")
    for c in NEW + ["dd-0.05"]:
        arg = np.argmax(joint[:, :, k[c]], 1)
        p(f"  {c:23s} " + "  ".join(f"{f} {(arg == fi).mean():.2f}" for fi, f in enumerate(m6.FAMS)))

    def share(a, b_):
        return float((w[:, k[a]] < w[:, k[b_]]).mean())
    p("\n## paired: share of joint draws where the first rule's worst case is lower")
    pairs = [("adaptive-dd-0.25", "uniform-dd-0.25"), ("adaptive-dd-0.5", "uniform-dd-0.5"),
             ("adaptive-dd-0.25", "adaptive-deg-0.25"), ("uniform-dd-0.25", "survey-degree-0.25"),
             ("adaptive-deg-0.25", "survey-degree-0.25"), ("adaptive-dd-0.5", "degree"),
             ("adaptive-dd-0.25", "degree")]
    for f, sp in SPLITS.items():
        pairs += [(sp[0.25], sp[0.5]), (sp[0.75], sp[0.5])]
    for a, b_ in pairs:
        p(f"  {a} vs {b_}: {share(a, b_):.3f}")
    p("\n## split (stage-1 share of the survey): joint median worst case")
    for f, sp in SPLITS.items():
        p(f"  f = {f}: " + "  ".join(f"s {s:g} {med[c]:.4f}" for s, c in sp.items()))

    h19v = share("adaptive-dd-0.5", "degree")
    h19 = med["adaptive-dd-0.5"] <= 0.025 and h19v >= 0.9
    h20a, h20b = share("adaptive-dd-0.25", "uniform-dd-0.25"), share("adaptive-dd-0.5", "uniform-dd-0.5")
    h20 = h20a >= 0.8 and h20b >= 0.8
    gaps = {f: med[sp[0.5]] - min(med[c] for c in sp.values()) for f, sp in SPLITS.items()}
    h21 = all(g <= 0.005 for g in gaps.values())
    p(f"\nH19 (adaptive-dd-0.5 joint median worst case <= 2.5% and below census top degree in >= 90% of draws): "
      f"{'held' if h19 else 'refuted'}; median {med['adaptive-dd-0.5']:.4f}, share {h19v:.3f}")
    p(f"H20 (adaptive beats uniform with degree discount in >= 80% of draws at f = 0.25 and 0.5): "
      f"{'held' if h20 else 'refuted'}; {h20a:.3f} and {h20b:.3f}")
    p(f"H21 (the half split within 0.5 point of the best split's joint median at both shares): "
      f"{'held' if h21 else 'refuted'}; gaps " + ", ".join(f"f {f}: {g:.4f}" for f, g in gaps.items()))
    mm = {c: float((best == k[c]).mean()) for c in NEW}
    p(f"prediction (not tested): no survey rule is minimax in any draw: largest share {max(mm.values()):.3f}")
    p(f"prediction (not tested): adaptive-dd-0.5 median in [0.015, 0.02]: {med['adaptive-dd-0.5']:.4f}; "
      f"adaptive-dd-0.25 median in [0.035, 0.045]: {med['adaptive-dd-0.25']:.4f}")
    p(f"prediction (not tested): split 0.25 best at f = 0.5 and not best at f = 0.25: "
      + ", ".join(f"f {f} best s {min(sp, key=lambda s: med[sp[s]]):g}" for f, sp in SPLITS.items()))
    txt = "\n".join(lines) + "\n"
    open(os.path.join(HERE, "smoke_verdicts.txt" if m6.SMOKE else "verdicts.txt"), "w").write(txt)
    json.dump({"rules": NEW,
               "worst_point": {c: round(float(r["worst0"][k[c]]), 5) for c in NEW + ["dd-0.05", "degree"]},
               "worst_joint_q": {c: np.percentile(w[:, k[c]], [5, 50, 95]).round(5).tolist()
                                 for c in NEW + ["survey-degree-0.25", "dd-0.05", "degree", "greedy-T"]},
               "split_median": {f: {f"{s:g}": med[c] for s, c in sp.items()} for f, sp in SPLITS.items()},
               "h19": [med["adaptive-dd-0.5"], h19v], "h20": [h20a, h20b], "h21_gaps": gaps},
              open(os.path.join(HERE, "smoke_verdicts.json" if m6.SMOKE else "verdicts.json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
