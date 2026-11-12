"""Milestone 7r (7q plus a coder-negative-cell guard: cells only if the pilot holds >= k human positives among coder-negative items): a dial on coder informedness. Argument 1 is the coder (nb-in-language), argument 3 is a
signal s: s>0 sets each coder label to the human label with probability s (J rises toward 1); s<0 replaces it with a
random draw at the coder base rate with probability -s (J falls toward 0). Writes h7q_<s>.txt.

Original 7p docstring:  does 7o's guard result at 2% prevalence hold for other coders (nb-english, lexicon-en)? Same
corpus recipe as h7o (NaijaSenti negative, 6,000 items, 2% positives, n 1000), coder is the first argument. Rules: pooled,
forced cells (guard 0), guard 5, 10, and the library default (tau 0.3, guard 20); pilot share 0.3 and 0.5; the
interval is the fitted-lambda one of h7l. Same pilots across rules within a share. Writes h7o_rare_guard.txt.

    python3.13 experiments/h7p_rare_guard_coders.py <coder> [reps]
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
CODER = ARGS[0]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import h3_llm_width as H3  # noqa: E402
import h7l_fixed_lambda as L  # noqa: E402
from llmci import audit_design as A  # noqa: E402

REPS = int(ARGS[1]) if len(ARGS) > 1 else 500
SIG = float(ARGS[2]) if len(ARGS) > 2 else 0.0
SEED = 20261104
N, CORPUS, PREV = 1000, 6000, 0.02
RULES = (("pooled", 2.0, 0), ("cells g0", 0.0, 0), ("cells g10", 0.0, 10), ("negcell k3", "k", 3), ("negcell k5", "k", 5), ("negcell k8", "k", 8))


def main():
    train, test, _ = H3.corpus()
    codes, _ = H3.coder(CODER, train, test)
    pos = [i for i in range(len(test)) if test[i][2] == 1]
    neg = [i for i in range(len(test)) if test[i][2] != 1]
    k = round(PREV * CORPUS)
    rs = random.Random(SEED)
    idx = rs.sample(pos, k) + rs.sample(neg, CORPUS - k)
    human = [test[i][2] for i in idx]
    f = [int(codes[i]) for i in idx]
    rd = random.Random(SEED + 99)
    base = sum(f) / len(f)
    f = [h if (SIG > 0 and rd.random() < SIG) else (int(rd.random() < base) if (SIG < 0 and rd.random() < -SIG) else x)
         for x, h in zip(f, human)]
    truth = sum(human) / len(human)
    tp=sum(1 for a,b in zip(human,f) if a and b); fn=sum(human)-tp; fp=sum(f)-tp; tn=len(f)-tp-fn-fp
    J = tp/(tp+fn)+tn/(tn+fp)-1
    out = [f"NaijaSenti negative, {CODER}, corpus {CORPUS}, prevalence {truth:.4f}, coder J {J:.3f}, n {N}, {REPS} draws",
           "pilot share | rule | share of draws using cells % | coverage % | half-width pts | mean pilot positives"]
    for share in (0.5,):
        rr = random.Random(SEED + int(share * 10))
        draws = [rr.sample(range(len(f)), round(share * N)) for _ in range(REPS)]
        sub = [random.Random(SEED + 7 * d) for d in range(REPS)]
        npil = sum(sum(human[i] for i in p) for p in draws) / REPS
        for name, tau, guard in RULES:
            cov, hw, nc = 0, 0.0, 0
            for d, pilot in enumerate(draws):
                labels = {i: human[i] for i in pilot}
                if tau == "k":
                    fn = sum(1 for i in pilot if f[i] == 0 and human[i] == 1)
                    plan = A.plan_audit(f, labels, N, tau=(0.0 if fn >= guard else 2.0), guard=0, width_margin=None)
                else:
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
    (HERE / f"h7r_{SIG}.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
