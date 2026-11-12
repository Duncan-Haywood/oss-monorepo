"""Milestone 7m: cells vs pooled when the category is rare (fitted lambda noisy). Re-weights the NaijaSenti
test set to a target prevalence by subsampling positives (corpus of 6,000), same nb-in-language coder.
Reuses h7l's interval. Writes h7m_rare_cells.txt.

    python3.13 experiments/h7m_rare_cells.py [reps]
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
SEED = 20261103
N, SHARE, CORPUS = 1000, 0.3, 6000


def main():
    train, test, _ = H3.corpus()
    codes, _ = H3.coder("nb-in-language", train, test)
    pos = [i for i in range(len(test)) if test[i][2] == 1]
    neg = [i for i in range(len(test)) if test[i][2] != 1]
    out = [f"NaijaSenti negative, nb-in-language, corpus {CORPUS}, n {N}, pilot share {SHARE}, {REPS} draws; {len(pos)} positives and {len(neg)} others available",
           "prevalence | design | lambda | coverage % | half-width pts | mean pilot positives"]
    for prev in (0.02, 0.05, 0.10):
        k = round(prev * CORPUS)
        if k > len(pos) or CORPUS - k > len(neg):
            out.append(f"{prev}: not enough items"); continue
        rs = random.Random(SEED)
        idx = rs.sample(pos, k) + rs.sample(neg, CORPUS - k)
        f = [int(codes[i]) for i in idx]
        human = [test[i][2] for i in idx]
        truth = sum(human) / len(human)
        res = {(d, m): [] for d in ("cells", "pooled") for m in ("0", "fit")}
        npil = []
        for d, tau in (("cells", 0.0), ("pooled", 2.0)):
            rr = random.Random(SEED + 1)
            for _ in range(REPS):
                pilot = rr.sample(range(len(f)), round(SHARE * N))
                labels = {i: human[i] for i in pilot}
                if d == "cells":
                    npil.append(sum(human[i] for i in pilot))
                plan = A.plan_audit(f, labels, N, tau=tau, guard=0, width_margin=None)
                for cell, t in zip(plan["cells"], plan["to_label"]):
                    for i in rr.sample([i for i in cell if i not in labels], t):
                        labels[i] = human[i]
                for m in ("0", "fit"):
                    lo, hi = L.interval(plan, f, labels, m)
                    res[(d, m)].append(((hi - lo) / 2, lo <= truth <= hi))
        for m in ("0", "fit"):
            for d in ("cells", "pooled"):
                v = res[(d, m)]
                line = f"{truth:.4f} | {d} | {m} | {100 * sum(x[1] for x in v) / REPS:.1f} | {100 * sum(x[0] for x in v) / REPS:.3f} | {sum(npil) / len(npil):.1f}"
                out.append(line); print(line, flush=True)
            r = sum(x[0] for x in res[("cells", m)]) / sum(x[0] for x in res[("pooled", m)])
            out.append(f"  ratio cells/pooled at lambda {m}: {r:.3f}"); print(out[-1])
    (HERE / "h7m_rare_cells.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
