"""Milestone 7ag: a fresh, pre-registered test of `audit_design.cells_probability`, the post-hoc explanation of 7af.

7af fitted q2 = P(FN >= 3 and J_hat >= 0) to the same 36 cells it explained, so it was a hypothesis that fits, not a
confirmed one. This script runs cells no earlier milestone ran: NaijaSenti negative share thinned (as 7ac: every
non-negative item of the test part kept, negatives subsampled by label with seed 7) to 2%, 5% and 10%; two coders, the
nb-in-language model of 7ab/7ac and the English lexicon (`lexicon-en`, a weaker coder on Nigerian-language tweets);
n = 600 and 2,000, pilot round(0.3 n); 1,000 draws per cell; rules pooled and neg_guard=3 alone (tau 0, guard 0).

    python3 experiments/h7ag_fresh_forecast.py forecast    # forecasts only, no draws (run first; pasted below)
    python3 experiments/h7ag_fresh_forecast.py [reps]      # the draws; writes h7ag_fresh_forecast.txt

Forecasts (from `forecast`, before any draw ran; exact `cells_probability`, % of draws using coder cells):
  coder | target prev | n | corpus | prevalence | J | pilot | forecast %
  nb-in-language | 0.02 | 600 | 30480 | 0.0200 | 0.397 | 180 | 16.8
  nb-in-language | 0.02 | 2000 | 30480 | 0.0200 | 0.397 | 600 | 88.3
  nb-in-language | 0.05 | 600 | 31442 | 0.0500 | 0.394 | 180 | 73.0
  nb-in-language | 0.05 | 2000 | 31442 | 0.0500 | 0.394 | 600 | 100.0
  nb-in-language | 0.1 | 600 | 33189 | 0.1000 | 0.398 | 180 | 98.3
  nb-in-language | 0.1 | 2000 | 33189 | 0.1000 | 0.398 | 600 | 100.0
  lexicon-en | 0.02 | 600 | 30480 | 0.0200 | 0.030 | 180 | 23.8
  lexicon-en | 0.02 | 2000 | 30480 | 0.0200 | 0.030 | 600 | 37.3
  lexicon-en | 0.05 | 600 | 31442 | 0.0500 | 0.027 | 180 | 46.2
  lexicon-en | 0.05 | 2000 | 31442 | 0.0500 | 0.027 | 600 | 65.8
  lexicon-en | 0.1 | 600 | 33189 | 0.1000 | 0.030 | 180 | 64.0
  lexicon-en | 0.1 | 2000 | 33189 | 0.1000 | 0.030 | 600 | 89.7
  The lexicon coder (J about 0.03) is the sharp case: its pilots often hold misses with an informedness below zero,
  so the J_hat >= 0 term, not the guard, sets the share (guard_fire_probability alone would be near 100% at n 2,000).

Prediction (written before the draws):
  P1  |forecast - observed share| <= max(5 points, 3 binomial SEs at 1,000 draws) in all 12 cells.
  P2  neg_guard=3 alone covers 93% or more in all 12 cells.
  P3  every cell with forecast < 25% has a width ratio (guard-only / pooled) in [0.97, 1.04] (7af's P2 on fresh cells).
  Refuted: P1 if any cell misses; P2 if any cell is under 93%; P3 if any such cell falls outside the band.
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
import h3_llm_width as H3  # noqa: E402
from llmci import audit_design as A  # noqa: E402

SEED = 20261111
PREVS = (0.02, 0.05, 0.10)
CODERS = ("nb-in-language", "lexicon-en")
NS = (600, 2000)
RULES = (("pooled", 2.0, 0, 0), ("neg_guard=3 alone", 0.0, 0, A.NEG_GUARD))


def corpora():
    train, test, _ = H3.corpus()
    zeros = [i for i in range(len(test)) if test[i][2] == 0]
    ones = [i for i in range(len(test)) if test[i][2] == 1]
    for cname in CODERS:
        codes, _ = H3.coder(cname, train, test)
        for prev in PREVS:
            rng = random.Random(7)
            k = round(prev / (1 - prev) * len(zeros))
            idx = sorted(zeros + rng.sample(ones, min(k, len(ones))))
            yield cname, prev, [test[i][2] for i in idx], [int(codes[i]) for i in idx]


def counts(h, f):
    tp = sum(1 for a, b in zip(h, f) if a and b)
    fn = sum(1 for a, b in zip(h, f) if a and not b)
    fp = sum(1 for a, b in zip(h, f) if b and not a)
    return tp, fn, fp


def one(f, human, n, truth, rr, tau, guard, ng):
    pilot = rr.sample(range(len(f)), round(A.PILOT_SHARE * n))
    labels = {i: human[i] for i in pilot}
    plan = A.plan_audit(f, labels, n, tau=tau, guard=guard, neg_guard=ng, width_margin=None)
    for cell, t in zip(plan["cells"], plan["to_label"]):
        for i in rr.sample([i for i in cell if i not in labels], t):
            labels[i] = human[i]
    est, lo, hi = A.audit_interval(plan, f, labels)
    return (hi - lo) / 2, lo <= truth <= hi, plan["design"] == "cells"


def main():
    mode = ARGS[0] if ARGS else "1000"
    out = ["coder | target prev | n | corpus | prevalence | J | pilot | forecast % | observed % | |diff| | tol | "
           "coverage pooled % | coverage guard-only % | half-width pooled | half-width guard-only | ratio"]
    for cname, prev, h, f in corpora():
        tp, fn, fp = counts(h, f)
        N, truth = len(h), sum(h) / len(h)
        for n in NS:
            pilot = round(A.PILOT_SHARE * n)
            q = 100 * A.cells_probability(pilot, tp, fn, fp, N)
            head = f"{cname} | {prev} | {n} | {N} | {truth:.4f} | {A.informedness(h, f):.3f} | {pilot} | {q:.1f}"
            if mode == "forecast":
                print(head, flush=True); continue
            reps = int(mode)
            res = {}
            for name, tau, g, ng in RULES:
                rr = random.Random(SEED + n + int(1000 * prev))
                res[name] = [one(f, h, n, truth, rr, tau, g, ng) for _ in range(reps)]
            P, G = res["pooled"], res["neg_guard=3 alone"]
            obs = 100 * sum(x[2] for x in G) / reps
            tol = max(5.0, 300 * ((q / 100) * (1 - q / 100) / reps) ** 0.5)
            wp, wg = sum(x[0] for x in P) / reps, sum(x[0] for x in G) / reps
            line = (f"{head} | {obs:.1f} | {abs(q - obs):.1f} | {tol:.1f} | {100*sum(x[1] for x in P)/reps:.1f} | "
                    f"{100*sum(x[1] for x in G)/reps:.1f} | {100*wp:.3f} | {100*wg:.3f} | {wg/wp:.3f}")
            out.append(line); print(line, flush=True)
    if mode != "forecast":
        (HERE / "h7ag_fresh_forecast.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
