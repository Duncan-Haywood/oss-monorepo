"""Milestone 8: do the complex-centrality rules of milestone 7 stay where they were when the
fitted parameters are uncertain?

Runs milestone 6's joint village bootstrap unchanged (same grid, seeds, refits and scoring) with
milestone 7's six complex-centrality rules (`seeding.COMPLEX_RULES`) added to the deterministic
rule set, then tests H13-H15. Milestone 6's tables, with the new rows, are written to
`results.txt`; the tests to `verdicts.txt`. Plan in LOG.md (2026-11-16, milestone 8), written
before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m8_cc_uncertainty/run.py   (about 12 minutes on 4 cores)
"""
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
m6.EXTRA_RULES = dict(sd.COMPLEX_RULES)
m6.OUT_DIR = HERE

CC = list(sd.COMPLEX_RULES)


def main():
    r = m6.main()
    rules, joint, draws, V = r["rules"], r["joint"], r["draws"], None
    w = joint.max(1)                                   # B x rules worst case over I, T, R
    B = w.shape[0]
    k = {name: rules.index(name) for name in rules}
    kdd, kdeg = k["dd-0.05"], k["degree"]
    best = np.argmin(w, 1)
    lines = []
    p = lines.append
    p("# Milestone 8: complex-centrality rules under milestone 6's joint bootstrap")
    p(f"B = {B} joint draws; worst-case regret over I, T, R; reference set = milestone 6's 23 rules + {len(CC)} cc rules")
    p("\n## per cc rule: point fit | joint median [5%, 95%] | share of draws: beats dd-0.05 / beats top degree / minimax")
    for c in CC + ["dd-0.05", "degree", "greedy-T"]:
        a, lo, hi = np.percentile(w[:, k[c]], [50, 5, 95])
        p(f"  {c:15s} {r['worst0'][k[c]]:.3f} | {a:.3f} [{lo:.3f}, {hi:.3f}] | "
          f"{(w[:, k[c]] <= w[:, kdd]).mean():.3f} / {(w[:, k[c]] < w[:, kdeg]).mean():.3f} / {(best == k[c]).mean():.3f}")
    p("\n## median regret per family, joint draws")
    for c in CC + ["dd-0.05", "degree"]:
        p(f"  {c:15s} " + "  ".join(f"{f} {np.median(joint[:, fi, k[c]]):.3f}" for fi, f in enumerate(m6.FAMS)))
    p("\n## family of the worst case (share of draws)")
    for c in CC + ["dd-0.05"]:
        arg = np.argmax(joint[:, :, k[c]], 1)
        p(f"  {c:15s} " + "  ".join(f"{f} {(arg == fi).mean():.2f}" for fi, f in enumerate(m6.FAMS)))

    # H15: cc-abs2's regret under T by the refitted threshold
    fT = m6.FAMS.index("T")
    th = np.array([m6.POINTS[d["T"]][5] for d in draws], float)
    regT = joint[:, fT, k["cc-abs2"]]
    regT_deg = joint[:, fT, kdeg]
    p("\n## regret under T by the draw's refitted theta (median; n draws)")
    for t in np.unique(th):
        m = th == t
        p(f"  theta {t:.2f} (n {m.sum():3d}): cc-abs2 {np.median(regT[m]):.4f}  degree {np.median(regT_deg[m]):.4f}  "
          f"dd-0.05 {np.median(joint[m, fT, kdd]):.4f}")

    beats = {c: float((w[:, k[c]] <= w[:, kdd]).mean()) for c in CC}
    h13 = max(beats.values()) <= 0.05
    h14v = float((w[:, k["cc-abs2"]] < w[:, kdeg]).mean())
    h14 = h14v >= 0.5
    n_lo, n_hi = int((th <= 0.4).sum()), int((th >= 0.6).sum())
    lo_t = np.median(regT[th <= 0.4]) if n_lo else np.nan
    hi_t = np.median(regT[th >= 0.6]) if n_hi else np.nan
    h15 = hi_t < lo_t
    mm = {c: float((best == k[c]).mean()) for c in CC}
    p(f"\nH13 (dd-0.05 below every cc rule's worst case in >= 95% of draws): {'held' if h13 else 'refuted'}; "
      f"largest share of draws a cc rule matches or beats it: {max(beats.values()):.3f} ({max(beats, key=beats.get)})")
    p(f"H14 (cc-abs2 below top degree's worst case in >= 50% of draws): {'held' if h14 else 'refuted'}; {h14v:.3f}")
    p(f"H15 (under T, cc-abs2's median regret lower when theta >= 0.6 than when theta <= 0.4): "
      f"{('held' if h15 else 'refuted') if n_lo and n_hi else 'untestable (an empty group)'}; {hi_t:.4f} against {lo_t:.4f} (n {int((th >= 0.6).sum())} and {int((th <= 0.4).sum())})")
    p(f"prediction (not tested): no cc rule is minimax in any draw: largest share {max(mm.values()):.3f}")
    p(f"prediction (not tested): cc-abs2 median worst case in [0.03, 0.045]: {np.median(w[:, k['cc-abs2']]):.4f}")
    txt = "\n".join(lines) + "\n"
    open(os.path.join(HERE, "smoke_verdicts.txt" if m6.SMOKE else "verdicts.txt"), "w").write(txt)
    json.dump({"cc_rules": CC, "beats_dd": beats, "cc_abs2_beats_degree": h14v,
               "T_theta_median_regret_cc_abs2": {f"{t:g}": float(np.median(regT[th == t])) for t in np.unique(th)},
               "worst_joint_q": {c: np.percentile(w[:, k[c]], [5, 50, 95]).round(5).tolist()
                                 for c in CC + ["dd-0.05", "degree", "greedy-T"]}},
              open(os.path.join(HERE, "smoke_verdicts.json" if m6.SMOKE else "verdicts.json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
