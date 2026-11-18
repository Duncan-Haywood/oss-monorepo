"""Milestone 13: is milestone 12's census gain from uneven forgetting real, or the harness's re-draw noise?

Milestone 12's run (milestone 6's joint bootstrap, B = 500, S = 100, 100 draws per randomised rule;
milestone 10's 9, milestone 11's 12 and milestone 12's 9 randomised rules) with two changes:

1. every extra randomised rule is scored on its own stream keyed by its name
   (`m6.PER_RULE_STREAMS`), so adding a rule re-draws no other (tests/test_streams.py);
2. four rules get four replicates each (surveys and scoring runs drawn afresh, `name#r<j>`):
   census-dd and adaptive-dd-0.5-s0.75 under measured and matched recall. Replicates are scored
   but kept out of the best-rule reference; copy c of the experiment swaps replicate c in for the
   four rules (c = 0 is the primary), so each copy is a full re-draw of those rules' Monte Carlo.

Tests H30-H33. Plan in LOG.md (2026-11-17, milestone 13), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m13_streams/run.py   (about 30 minutes on 4 cores)
"""
import importlib.util
import itertools
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))

_spec = importlib.util.spec_from_file_location("m12", os.path.join(HERE, "..", "m12_strength", "run.py"))
m12 = importlib.util.module_from_spec(_spec)
sys.modules["m12"] = m12
_spec.loader.exec_module(m12)
m6, m11 = m12.m6, m12.m11

N_REP = 4
KEY = ["census-dd-measured", "census-dd-matched",
       "adaptive-dd-0.5-s0.75-measured", "adaptive-dd-0.5-s0.75-matched"]
REPS = {f"{c}#r{j}": m12.NEW[c] for c in KEY for j in range(1, N_REP + 1)}
m6.EXTRA_RANDOMISED = {**m6.EXTRA_RANDOMISED, **REPS}
m6.PER_RULE_STREAMS = True
m6.NOT_IN_REFERENCE = set(REPS)
m6.OUT_DIR = HERE


def copy_regret(r, cols):
    """B x F x len(cols) regret against the best of `cols`, each draw under its refitted process."""
    E, W, draws = r["E"], r["W"], r["draws"]
    B = W.shape[0]
    out = np.zeros((B, len(m6.FAMS), len(cols)))
    for bi in range(B):
        for fi, f in enumerate(m6.FAMS):
            tot = E[draws[bi][f]][cols] @ W[bi]
            out[bi, fi] = 1 - tot / tot.max()
    return out


def main():
    r = m6.main()
    rules = r["rules"]
    k = {c: i for i, c in enumerate(rules)}
    prim = [c for c in rules if c not in REPS]
    copies = []
    for c in range(N_REP + 1):
        names = [x if (c == 0 or x not in KEY) else f"{x}#r{c}" for x in prim]
        w = copy_regret(r, [k[x] for x in names]).max(1)
        copies.append({x: w[:, i] for i, x in enumerate(prim)})
    med = np.array([[np.median(cp[x]) for x in KEY] for cp in copies])      # copies x KEY
    lines = []
    p = lines.append
    p("# Milestone 13: per-rule scoring streams and replicate re-draws of milestone 12's key rules")
    p(f"B = {len(copies[0][KEY[0]])} joint draws; {N_REP + 1} copies (primary + {N_REP} replicates) of {len(KEY)} rules; "
      f"reference = the {len(prim)} primary rules, the copy's replicate swapped in")
    p("\n## milestone 12's rows, shared stream (m12_strength/verdicts.json) -> own stream (copy 0): joint median")
    old = json.load(open(os.path.join(HERE, "..", "m12_strength", "verdicts.json")))["worst_joint_q"]
    shift = {}
    for x in m12.NEW:
        a = float(np.median(copies[0][x]))
        shift[x] = a - old[x][1]
        p(f"  {x:34s} {old[x][1]:.4f} -> {a:.4f} ({shift[x] * 100:+.2f} point)")
    p("\n## joint median of the key rules per copy (copy 0 = primary)")
    for i, x in enumerate(KEY):
        p(f"  {x:34s} " + "  ".join(f"{m:.4f}" for m in med[:, i])
          + f" | mean {med[:, i].mean():.4f} sd {med[:, i].std(ddof=1):.4f} range {np.ptp(med[:, i]):.4f}")
    d_dd = med[:, 0] - med[:, 1]
    d_ad = med[:, 2] - med[:, 3]
    p("\n## measured minus matched joint median, per copy")
    p("  census-dd:              " + "  ".join(f"{x * 100:+.2f}" for x in d_dd) + f" | mean {d_dd.mean() * 100:+.2f} point")
    p("  adaptive-dd-0.5-s0.75:  " + "  ".join(f"{x * 100:+.2f}" for x in d_ad) + f" | mean {d_ad.mean() * 100:+.2f} point")
    # null: two copies of the same rule, same recall setting
    null = [abs(med[a, i] - med[b, i]) for i in range(len(KEY)) for a, b in itertools.combinations(range(N_REP + 1), 2)]
    p(f"\n## null: |difference| between two copies of the same rule ({len(null)} pairs): "
      f"median {np.median(null) * 100:.2f}, max {max(null) * 100:.2f} point")
    p("\n## paired share of joint draws, measured below matched, per copy")
    sh_dd = [float((cp[KEY[0]] < cp[KEY[1]]).mean()) for cp in copies]
    sh_ad = [float((cp[KEY[2]] < cp[KEY[3]]).mean()) for cp in copies]
    p("  census-dd:             " + "  ".join(f"{x:.3f}" for x in sh_dd))
    p("  adaptive-dd-0.5-s0.75: " + "  ".join(f"{x:.3f}" for x in sh_ad))
    pooled = {x: float(np.median(np.concatenate([cp[x] for cp in copies]))) for x in KEY}
    p("\n## pooled over copies (5 x B draws): joint median")
    for x in KEY:
        p(f"  {x:34s} {pooled[x]:.4f}")
    p(f"\n## reference rows (copy 0): perfect census dd-0.05 {np.median(copies[0]['dd-0.05']):.4f}, "
      f"census top degree {np.median(copies[0]['degree']):.4f}, adaptive-dd-0.5-s0.75 {np.median(copies[0]['adaptive-dd-0.5-s0.75']):.4f}")

    sd_ = med.std(0, ddof=1)
    h31 = bool((sd_ <= 0.0025).all())
    h32 = bool((d_dd < 0).all() and d_dd.mean() <= -0.005)
    h33 = bool(abs(d_ad.mean()) <= 0.005)
    p(f"\nH31 (each key rule's joint median varies across copies with sd <= 0.25 point): "
      f"{'held' if h31 else 'refuted'}; sd " + ", ".join(f"{x * 100:.2f}" for x in sd_))
    p(f"H32 (census dd measured below matched in every copy, mean gap <= -0.5 point): "
      f"{'held' if h32 else 'refuted'}; mean {d_dd.mean() * 100:+.2f}, copies negative {(d_dd < 0).sum()}/{len(d_dd)}")
    p(f"H33 (survey rule measured minus matched, mean |gap| <= 0.5 point): "
      f"{'held' if h33 else 'refuted'}; mean {d_ad.mean() * 100:+.2f}")
    p("prediction (not tested): switching to own streams moves milestone 12's rows by at most 0.6 point: "
      f"max |shift| {max(abs(x) for x in shift.values()) * 100:.2f}")
    txt = "\n".join(lines) + "\n"
    out = "smoke_verdicts" if m6.SMOKE else "verdicts"
    open(os.path.join(HERE, out + ".txt"), "w").write(txt)
    json.dump({"key": KEY, "median_per_copy": med.round(5).tolist(), "sd": sd_.round(5).tolist(),
               "d_dd": d_dd.round(5).tolist(), "d_ad": d_ad.round(5).tolist(), "share_dd": sh_dd,
               "share_ad": sh_ad, "pooled": pooled, "shift_from_m12": shift,
               "null_abs": [round(float(x), 5) for x in null], "h31": h31, "h32": h32, "h33": h33},
              open(os.path.join(HERE, out + ".json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
