"""Milestone 7ac: the rare-category case on a second corpus. NaijaSenti negative share thinned (label-based subsample of the
negatives is subsampled by label, so the coder is unchanged) to PREV of the corpus (0.01 or 0.03), nb-in-language coder, whole test part.
Prediction (written before the runs): neg_guard=3 alone covers 93% or more at both and is no wider than pooled.
    python3 experiments/h7ac_naija_rare.py [reps] [prev]     Writes h7ac_naija_rare_<prev>.txt.
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
import h3_llm_width as H3  # noqa: E402
from llmci import audit_design as A  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
SEED = 20261110
PREV = float(ARGS[1]) if len(ARGS) > 1 else 0.03
RULES = (("pooled", 2.0, 0, 0), ("shipped default", A.TAU_6AM, A.GUARD_6AM, A.NEG_GUARD), ("neg_guard=3 alone", 0.0, 0, A.NEG_GUARD))


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
    train, test, _ = H3.corpus()
    codes, _ = H3.coder("nb-in-language", train, test)
    rng = random.Random(7)
    zeros = [i for i in range(len(test)) if test[i][2] == 0]
    ones = [i for i in range(len(test)) if test[i][2] == 1]
    k = round(PREV / (1 - PREV) * len(zeros))
    idx = sorted(zeros + rng.sample(ones, min(k, len(ones))))
    f = [int(codes[i]) for i in idx]
    human = [test[i][2] for i in idx]
    truth = sum(human) / len(human)
    out = [f"NaijaSenti negative share thinned to {PREV}, nb-in-language: corpus {len(idx)}, prevalence {truth:.4f}, corpus J {A.informedness(human, f):.3f}; {REPS} draws",
           "n | rule | cells % | coverage % | half-width pts"]
    for n in (1000, 3000):
        for name, tau, g, ng in RULES:
            rr = random.Random(SEED + n)
            r = [one(f, human, n, truth, rr, tau, g, ng) for _ in range(REPS)]
            line = f"{n} | {name} | {100*sum(x[2] for x in r)/REPS:.0f} | {100*sum(x[1] for x in r)/REPS:.1f} | {100*sum(x[0] for x in r)/REPS:.3f}"
            out.append(line); print(line, flush=True)
    (HERE / f"h7ac_naija_rare_{PREV}.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
