"""Milestone 7l: do coder cells beat pooled at fixed lambda (0, 1) and fitted lambda? Same draws as 7k.
Interval code mirrors llmci.audit_interval with lambda overridable. Writes h7l_fixed_lambda.txt.

    python3 experiments/h7l_fixed_lambda.py [reps]
"""
import math
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
SEED = 20261103
N = 1000
SHARE = 0.3


def interval(plan, f_all, labels, lam_mode, z=1.959964):
    cells = plan["cells"]
    ys = [[labels[i] for i in c if i in labels] for c in cells]
    fs = [[f_all[i] for i in c if i in labels] for c in cells]
    ay = [v for y in ys for v in y]
    af = [v for f in fs for v in f]
    mf = sum(af) / len(af)
    vf = sum((v - mf) ** 2 for v in af) / (len(af) - 1)
    my = sum(ay) / len(ay)
    if lam_mode == "fit":
        lam = 0.0 if vf == 0 else min(1.0, max(0.0, sum((a - my) * (b - mf) for a, b in zip(ay, af)) / (len(ay) - 1) / vf))
    else:
        lam = float(lam_mode)
    total = sum(len(c) for c in cells)
    value = var = 0.0
    for c, y, f in zip(cells, ys, fs):
        r = [a - lam * b for a, b in zip(y, f)]
        mr = sum(r) / len(r)
        v = sum((x - mr) ** 2 for x in r) / (len(r) - 1)
        w = len(c) / total
        value += w * (lam * sum(f_all[i] for i in c) / len(c) + mr)
        var += w * w * (1 - len(y) / len(c)) * v / len(y)
    se = math.sqrt(var)
    p = min(0.9995, max(0.0005, value))
    n = p * (1 - p) / max(se, 1e-9) ** 2
    d = 1 + z * z / n
    mid = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return mid - half, mid + half


def main():
    train, test, idx = H3.corpus()
    codes, _ = H3.coder("nb-in-language", train, test)
    f = [int(codes[i]) for i in idx]
    human = [test[i][2] for i in idx]
    truth = sum(human) / len(human)
    out = [f"NaijaSenti negative, nb-in-language: prevalence {truth:.4f}, n {N}, pilot share {SHARE}, {REPS} draws",
           "design | lambda | coverage % | half-width pts"]
    modes = ("0", "1", "fit")
    res = {(d, m): [] for d in ("cells", "pooled") for m in modes}
    for d, tau in (("cells", 0.0), ("pooled", 2.0)):
        rr = random.Random(SEED)
        for _ in range(REPS):
            pilot = rr.sample(range(len(f)), round(SHARE * N))
            labels = {i: human[i] for i in pilot}
            plan = A.plan_audit(f, labels, N, tau=tau, guard=0, width_margin=None)
            for cell, t in zip(plan["cells"], plan["to_label"]):
                for i in rr.sample([i for i in cell if i not in labels], t):
                    labels[i] = human[i]
            for m in modes:
                lo, hi = interval(plan, f, labels, m)
                res[(d, m)].append(((hi - lo) / 2, lo <= truth <= hi))
    for m in modes:
        for d in ("cells", "pooled"):
            v = res[(d, m)]
            line = f"{d} | {m} | {100 * sum(x[1] for x in v) / REPS:.1f} | {100 * sum(x[0] for x in v) / REPS:.3f}"
            out.append(line)
            print(line, flush=True)
        r = sum(x[0] for x in res[("cells", m)]) / sum(x[0] for x in res[("pooled", m)])
        out.append(f"ratio cells/pooled at lambda {m}: {r:.3f}")
        print(out[-1])
    (HERE / "h7l_fixed_lambda.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
