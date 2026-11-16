"""Milestone 11, part B: does the survey's seeding advice survive tie-recall error?

Milestone 10's harness unchanged (milestone 6's joint bootstrap, B = 500, S = 100, 100 draws per
randomised rule), with milestone 10's nine survey rules kept and, at each recall rho in the grid,
four rules whose surveys forget ties (`seeding.survey_recall`): census top degree, census
degree discount, adaptive-dd-0.5 (half split) and adaptive-dd-0.5-s0.75. The grid is 0.5, 0.75
and part A's pooled three-question recall (`recall.json`, rounded to 0.05). Tests H22 to H24.
Plan in LOG.md (2026-11-16, milestone 11), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m11_recall/run.py   (about 30 minutes on 4 cores)
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

_spec = importlib.util.spec_from_file_location("m10", os.path.join(HERE, "..", "m10_survey_uncertainty", "run.py"))
m10 = importlib.util.module_from_spec(_spec)
sys.modules["m10"] = m10
_spec.loader.exec_module(m10)
m6 = m10.m6

RHO3 = json.load(open(os.path.join(HERE, "recall.json")))["rho_grid"]
GRID = sorted({0.5, 0.75, RHO3}, reverse=True)


def _deg(v, b, r, f, design, split, recall):
    return sd.rule_recall_degree(v, b, r, f, design, split, recall)


def _dd(v, b, r, f, design, split, recall):
    return sd.rule_recall_dd(v, b, r, f, design, split, recall)


def rules_at(rho):
    t = f"r{rho:g}"
    return {f"census-degree-{t}": functools.partial(_deg, f=1.0, design="uniform", split=None, recall=rho),
            f"census-dd-{t}": functools.partial(_dd, f=1.0, design="uniform", split=None, recall=rho),
            f"adaptive-dd-0.5-{t}": functools.partial(_dd, f=0.5, design="adaptive", split=None, recall=rho),
            f"adaptive-dd-0.5-s0.75-{t}": functools.partial(_dd, f=0.5, design="adaptive", split=0.75, recall=rho)}


NEW = {}
for rho in GRID:
    NEW.update(rules_at(rho))
m6.EXTRA_RANDOMISED = {**m10.EXTRA, **NEW}
m6.OUT_DIR = HERE
# rho = 1 rows are milestone 10's rules and the census rules
AT1 = {"census-degree": "degree", "census-dd": "dd-0.05", "adaptive-dd-0.5": "adaptive-dd-0.5",
       "adaptive-dd-0.5-s0.75": "adaptive-dd-0.5-s0.75"}


def name(base, rho):
    return AT1[base] if rho == 1.0 else f"{base}-r{rho:g}"


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
    p("# Milestone 11: survey and census seeding rules under tie-recall error, milestone 6's joint bootstrap")
    p(f"B = {w.shape[0]} joint draws; worst-case regret over I, T, R; recall grid {GRID} (part A: "
      f"three-question recall {RHO3:.2f}); reference set = milestone 6's 23 rules + milestone 10's 9 + {len(NEW)}")
    p("\n## rule at each recall: point fit | joint median [5%, 95%] | share of draws: beats perfect-recall census top degree / minimax")
    for base in AT1:
        for rho in [1.0] + GRID:
            c = name(base, rho)
            a, lo, hi = np.percentile(w[:, k[c]], [50, 5, 95])
            p(f"  {base:22s} rho {rho:4.2f} ({c:28s}) {r['worst0'][k[c]]:.3f} | {a:.3f} [{lo:.3f}, {hi:.3f}] | "
              f"{share(c, 'degree'):.3f} / {(best == k[c]).mean():.3f}")
    p("\n## milestone 10 rows re-drawn (sanity: within about 0.3 point of m10_survey_uncertainty/verdicts.txt)")
    for c in m10.NEW:
        a, lo, hi = np.percentile(w[:, k[c]], [50, 5, 95])
        p(f"  {c:23s} {r['worst0'][k[c]]:.3f} | {a:.3f} [{lo:.3f}, {hi:.3f}]")
    p("\n## median regret per family, joint draws")
    for c in NEW:
        p(f"  {c:28s} " + "  ".join(f"{f} {np.median(joint[:, fi, k[c]]):.3f}" for fi, f in enumerate(m6.FAMS)))
    p("\n## paired: share of joint draws where the first rule's worst case is lower")
    for rho in GRID:
        for a, b_ in [("adaptive-dd-0.5-s0.75", "adaptive-dd-0.5"), ("adaptive-dd-0.5-s0.75", "census-degree"),
                      ("census-dd", "census-degree"), ("adaptive-dd-0.5-s0.75", "census-dd")]:
            p(f"  rho {rho:g}: {name(a, rho)} vs {name(b_, rho)}: {share(name(a, rho), name(b_, rho)):.3f}")
        p(f"  rho {rho:g}: {name('census-dd', rho)} vs degree (perfect recall): {share(name('census-dd', rho), 'degree'):.3f}")
        p(f"  rho {rho:g}: {name('adaptive-dd-0.5-s0.75', rho)} vs dd-0.05 (perfect recall): "
          f"{share(name('adaptive-dd-0.5-s0.75', rho), 'dd-0.05'):.3f}")

    c22 = name("adaptive-dd-0.5-s0.75", RHO3)
    h22 = med[c22] <= 0.025 and share(c22, "degree") >= 0.9
    rise_s = med[name("adaptive-dd-0.5-s0.75", 0.5)] - med["adaptive-dd-0.5-s0.75"]
    rise_c = med[name("census-dd", 0.5)] - med["dd-0.05"]
    h23 = rise_s - rise_c <= 0.01
    h24v = share(name("census-dd", 0.5), "degree")
    h24 = h24v >= 0.9
    p(f"\nH22 ({c22} joint median <= 2.5% and below perfect-recall census top degree in >= 90% of draws): "
      f"{'held' if h22 else 'refuted'}; median {med[c22]:.4f}, share {share(c22, 'degree'):.3f}")
    p(f"H23 (at rho 0.5 the s0.75 survey's rise in joint median is at most 1 point above census dd's): "
      f"{'held' if h23 else 'refuted'}; survey +{rise_s:.4f}, census +{rise_c:.4f}, difference {rise_s - rise_c:+.4f}")
    p(f"H24 (census dd at rho 0.5 beats perfect-recall census top degree in >= 90% of draws): "
      f"{'held' if h24 else 'refuted'}; {h24v:.3f}")
    p("prediction (not tested): top degree barely moves: "
      + ", ".join(f"rho {rho:g} {med[name('census-degree', rho)]:.4f}" for rho in [1.0] + GRID))
    p("prediction (not tested): s0.75 at or ahead of the half split at every rho: "
      + ", ".join(f"rho {rho:g} {med[name('adaptive-dd-0.5-s0.75', rho)]:.4f} vs {med[name('adaptive-dd-0.5', rho)]:.4f}"
                  for rho in [1.0] + GRID))
    txt = "\n".join(lines) + "\n"
    out = "smoke_verdicts" if m6.SMOKE else "verdicts"
    open(os.path.join(HERE, out + ".txt"), "w").write(txt)
    json.dump({"grid": GRID, "rho3": RHO3,
               "worst_joint_q": {name(b, rho): np.percentile(w[:, k[name(b, rho)]], [5, 50, 95]).round(5).tolist()
                                 for b in AT1 for rho in [1.0] + GRID},
               "worst_point": {name(b, rho): round(float(r["worst0"][k[name(b, rho)]]), 5)
                               for b in AT1 for rho in [1.0] + GRID},
               "h22": [med[c22], share(c22, "degree")], "h23": [rise_s, rise_c], "h24": h24v},
              open(os.path.join(HERE, out + ".json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
