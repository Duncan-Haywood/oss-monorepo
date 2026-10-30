"""Milestone 7c: does the library path (llmci.audit_design.plan_audit -> draw -> audit_interval) reproduce 6al's guarded screen (G = 20)?
Same corpora, cached Qwen codes, n = 400 and 1000 and seed rule as 6al; the audit is run through the library only, so a person following
the README gets these numbers. Compare with h6al_guard.txt rows 'screen + guard G=20', rule 'P Wilson n_eff (WE)'. Writes h7c_end_to_end.txt.

    python3 experiments/h7c_end_to_end.py [reps]    # needs network for the data files; minutes
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import group_shift_reddit as R  # noqa: E402
import h3_llm_width as H3  # noqa: E402
import h6ab_llm_goemotions as B  # noqa: E402
import h6ak_screen as K  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402
from llmci import audit_design as A  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500


def one(f, human, n, truth, rr):
    pilot = rr.sample(range(len(f)), round(A.PILOT_SHARE * n))
    labels = {i: human[i] for i in pilot}
    plan = A.plan_audit(f, labels, n)
    for cell, t in zip(plan["cells"], plan["to_label"]):
        for i in rr.sample([i for i in cell if i not in labels], t):
            labels[i] = human[i]
    est, lo, hi = A.audit_interval(plan, f, labels)
    return (hi - lo) / 2, lo <= truth <= hi, plan["design"] == "cells", len(labels)


def run(label, f, human, out):
    truth = sum(human) / len(human)
    out.append(f"{label}: corpus {len(human)}, prevalence {truth:.4f}: n | coverage % | mean half-width pts | share of draws using cells | mean humans used")
    for n in B.SIZES_N:
        rr = random.Random(B.SEED)
        r = [one(f, human, n, truth, rr) for _ in range(REPS)]
        out.append(f"{label} | {n} | {100 * sum(x[1] for x in r) / REPS:.1f} | {100 * sum(x[0] for x in r) / REPS:.3f} | {sum(x[2] for x in r) / REPS:.2f} | {sum(x[3] for x in r) / REPS:.1f}")
    print("\n".join(out[-3:]), flush=True)


def main():
    out = []
    for cat in ("admiration", "neutral", "fear", "sadness"):
        rows = P.load(cat)
        rng = random.Random(R.SPLIT_SEED)
        order = list(range(len(rows)))
        rng.shuffle(order)
        test = [rows[i] for i in order[int(R.TRAIN_SHARE * len(rows)):]]
        sc = B.scores(cat, len(test))
        run(f"GoEmotions {cat}", [int(x > 0) for x in sc], [t[2] for t in test], out)
    _, test_all, idx = H3.corpus()
    sc = {m: {int(a): float(b) for a, b in (l.split("\t") for l in (HERE / f"llm_scores_{m}.tsv").read_text().splitlines())} for m in K.MODELS}
    idx = [i for i in idx if all(i in s for s in sc.values())]
    human = [test_all[i][2] for i in idx]
    for m in K.MODELS:
        run(f"NaijaSenti {m}", [int(sc[m][i] > 0) for i in idx], human, out)
    (HERE / "h7c_end_to_end.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
