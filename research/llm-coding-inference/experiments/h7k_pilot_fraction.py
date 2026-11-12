"""Milestone 7k: what fraction of the 7i ceiling does the coder-cell audit realise, against pilot share?
Forced cells (tau = 0, guard 0) vs forced pooled (tau = 2), same draws, NaijaSenti negative share, nb-in-language
coder (corpus J 0.388, ceiling 0.916). Pilot share in {0.1, 0.2, 0.3, 0.5}, n = 1000. Writes h7k_pilot_fraction.txt.

    python3 experiments/h7k_pilot_fraction.py [reps]
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import h3_llm_width as H3  # noqa: E402
from llmci import audit_design as A  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
SEED = 20261102
N = 1000


def one(f, human, share, truth, rr, tau, guard):
    pilot = rr.sample(range(len(f)), round(share * N))
    labels = {i: human[i] for i in pilot}
    plan = A.plan_audit(f, labels, N, tau=tau, guard=guard, width_margin=None)
    for cell, t in zip(plan["cells"], plan["to_label"]):
        for i in rr.sample([i for i in cell if i not in labels], t):
            labels[i] = human[i]
    _, lo, hi = A.audit_interval(plan, f, labels)
    return (hi - lo) / 2, lo <= truth <= hi, plan["design"] == "cells"


def main():
    train, test, idx = H3.corpus()
    codes, _ = H3.coder("nb-in-language", train, test)
    f = [int(codes[i]) for i in idx]
    human = [test[i][2] for i in idx]
    truth = sum(human) / len(human)
    sens = sum(1 for a, b in zip(human, f) if a and b) / sum(human)
    spec = sum(1 for a, b in zip(human, f) if not a and not b) / (len(human) - sum(human))
    ceil = A.cell_ceiling(sens, spec)
    out = [f"NaijaSenti negative, nb-in-language: corpus {len(idx)}, prevalence {truth:.4f}, J {A.informedness(human, f):.3f}, ceiling {ceil:.3f}; n {N}; {REPS} draws",
           "pilot share | design | coverage % | half-width pts | cells used | ratio cells/pooled | fraction of ceiling gain realised"]
    for share in (0.1, 0.2, 0.3, 0.5):
        res = {}
        for name, tau, guard in (("cells", 0.0, 0), ("pooled", 2.0, 0)):
            rr = random.Random(SEED + int(share * 100))
            res[name] = [one(f, human, share, truth, rr, tau, guard) for _ in range(REPS)]
        hw = {k: sum(x[0] for x in v) / REPS for k, v in res.items()}
        ratio = hw["cells"] / hw["pooled"]
        for name, v in res.items():
            line = (f"{share} | {name} | {100 * sum(x[1] for x in v) / REPS:.1f} | {100 * hw[name]:.3f} | "
                    f"{sum(x[2] for x in v) / REPS:.2f} | {ratio:.3f} | {(1 - ratio) / (1 - ceil):.2f}")
            out.append(line)
            print(line, flush=True)
    (HERE / "h7k_pilot_fraction.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
