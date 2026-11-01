"""Milestone 7g: does the library audit rule (7a-7c) gain on NaijaSenti once the zero-shot Qwen coder's threshold is tuned
on a separate hand-labelled calibration slice? 6aj found no gain at score > 0 because those coders had no informedness.
Calibration slice = a random third of the 6,000-tweet subsample (best Youden J threshold); the other two thirds are the
audited corpus. Compares plan_audit (screen -> pooled or cells) with the forced-pooled design (tau = 2), same draws.
Writes h7g_tuned_threshold.txt.

    python3 experiments/h7g_tuned_threshold.py [reps]
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import h3_llm_width as H3  # noqa: E402
import h6ak_screen as K  # noqa: E402
from llmci import audit_design as A  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
SEED = 20261101


def best_threshold(s, y):
    best = (-1, 0.0)
    for t in sorted(set(s)):
        f = [int(x > t) for x in s]
        j = A.informedness(y, f)
        if j > best[0]:
            best = (j, t)
    return best


def one(f, human, n, truth, rr, tau):
    pilot = rr.sample(range(len(f)), round(A.PILOT_SHARE * n))
    labels = {i: human[i] for i in pilot}
    plan = A.plan_audit(f, labels, n, tau=tau)
    for cell, t in zip(plan["cells"], plan["to_label"]):
        for i in rr.sample([i for i in cell if i not in labels], t):
            labels[i] = human[i]
    est, lo, hi = A.audit_interval(plan, f, labels)
    return (hi - lo) / 2, lo <= truth <= hi, plan["design"] == "cells"


def main():
    _, test_all, idx = H3.corpus()
    sc = {m: {int(a): float(b) for a, b in (l.split("\t") for l in (HERE / f"llm_scores_{m}.tsv").read_text().splitlines())} for m in K.MODELS}
    idx = [i for i in idx if all(i in s for s in sc.values())]
    rng = random.Random(SEED)
    rng.shuffle(idx)
    cal, aud = idx[: len(idx) // 3], idx[len(idx) // 3:]
    human = [test_all[i][2] for i in aud]
    truth = sum(human) / len(human)
    out = [f"NaijaSenti negative share: calibration slice {len(cal)} tweets, audited corpus {len(aud)} tweets, prevalence {truth:.4f}; {REPS} draws",
           "coder | threshold (cal J) | corpus J | coder-positive share | n | design | coverage % | half-width pts | share using cells"]
    for m in K.MODELS:
        j, t = best_threshold([sc[m][i] for i in cal], [test_all[i][2] for i in cal])
        f = [int(sc[m][i] > t) for i in aud]
        jc = A.informedness(human, f)
        for n in (400, 1000):
            for name, tau in (("screen", A.TAU), ("pooled", 2.0)):
                rr = random.Random(SEED + n)
                r = [one(f, human, n, truth, rr, tau) for _ in range(REPS)]
                line = (f"{m} | {t:g} ({j:.3f}) | {jc:.3f} | {sum(f) / len(f):.3f} | {n} | {name} | {100 * sum(x[1] for x in r) / REPS:.1f} | "
                        f"{100 * sum(x[0] for x in r) / REPS:.3f} | {sum(x[2] for x in r) / REPS:.2f}")
                out.append(line)
                print(line, flush=True)
    (HERE / "h7g_tuned_threshold.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
