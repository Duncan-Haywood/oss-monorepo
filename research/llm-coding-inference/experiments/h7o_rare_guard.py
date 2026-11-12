"""Milestone 7o: does a minimum-pilot-positives guard repair cells' undercoverage at 2% prevalence (7m)? Same
corpus and coder as h7m (NaijaSenti negative, nb-in-language, 6,000 items, 2% positives, n 1000). Rules: pooled,
forced cells (guard 0), guard 5, 10, and the library default (tau 0.3, guard 20); pilot share 0.3 and 0.5; the
interval is the fitted-lambda one of h7l. Same pilots across rules within a share. Writes h7o_rare_guard.txt.

    python3.13 experiments/h7o_rare_guard.py [reps]
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import h3_llm_width as H3  # noqa: E402
import h7l_fixed_lambda as L  # noqa: E402
from llmci import audit_design as A  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
SEED = 20261104
N, CORPUS, PREV = 1000, 6000, 0.02
RULES = (("pooled", 2.0, 0), ("cells g0", 0.0, 0), ("cells g5", 0.0, 5), ("cells g10", 0.0, 10), ("default", A.TAU_6AM, A.GUARD_6AM))


def main():
    train, test, _ = H3.corpus()
    codes, _ = H3.coder("nb-in-language", train, test)
    pos = [i for i in range(len(test)) if test[i][2] == 1]
    neg = [i for i in range(len(test)) if test[i][2] != 1]
    k = round(PREV * CORPUS)
    rs = random.Random(SEED)
    idx = rs.sample(pos, k) + rs.sample(neg, CORPUS - k)
    f = [int(codes[i]) for i in idx]
    human = [test[i][2] for i in idx]
    truth = sum(human) / len(human)
    out = [f"NaijaSenti negative, nb-in-language, corpus {CORPUS}, prevalence {truth:.4f}, n {N}, {REPS} draws",
           "pilot share | rule | share of draws using cells % | coverage % | half-width pts | mean pilot positives"]
    for share in (0.3, 0.5):
        rr = random.Random(SEED + int(share * 10))
        draws = [rr.sample(range(len(f)), round(share * N)) for _ in range(REPS)]
        sub = [random.Random(SEED + 7 * d) for d in range(REPS)]
        npil = sum(sum(human[i] for i in p) for p in draws) / REPS
        for name, tau, guard in RULES:
            cov, hw, nc = 0, 0.0, 0
            for d, pilot in enumerate(draws):
                labels = {i: human[i] for i in pilot}
                plan = A.plan_audit(f, labels, N, tau=tau, guard=guard, width_margin=None)
                nc += plan["design"] == "cells"
                for cell, t in zip(plan["cells"], plan["to_label"]):
                    for i in sub[d].sample([i for i in cell if i not in labels], t):
                        labels[i] = human[i]
                lo, hi = L.interval(plan, f, labels, "fit")
                hw += (hi - lo) / 2
                cov += lo <= truth <= hi
            line = f"{share} | {name} | {100 * nc / REPS:.0f} | {100 * cov / REPS:.1f} | {100 * hw / REPS:.3f} | {npil:.1f}"
            out.append(line); print(line, flush=True)
    (HERE / "h7o_rare_guard.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
