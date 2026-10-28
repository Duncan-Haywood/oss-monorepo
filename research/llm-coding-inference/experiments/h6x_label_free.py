"""Milestone 6x: a label-free audit-size rule for the rare-category audit (GoEmotions fear, sadness). The size is planned from
the coder's own positive share per group (no human label), S2_g = c * pf_g (1 - pf_g), with c in {1, 2}; then one fresh audit
of that size under Neyman allocation. Writes h6x_label_free.txt.

    python3 experiments/h6x_label_free.py     # reuses the GoEmotions cache of the h6r..h6w experiments; a few minutes
"""
import math
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift_reddit as R  # noqa: E402
import h6r_rare_pilot as H  # noqa: E402
from llmci import estimators as E  # noqa: E402

SEED, REPS = 20261030, H.REPS
FLOOR = 1e-4
CS = (1.0, 2.0)


def main():
    out = []
    for cat in H.CATS:
        rows = H.load(cat)
        rng = random.Random(R.SPLIT_SEED)
        order = list(range(len(rows)))
        rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
        human, n = [t[2] for t in test], len(test)
        f = H.coder(train, test)
        sets = {g: [i for i in range(n) if test[i][1] == g] for g in H.GROUPS}
        sizes = [len(sets[g]) for g in H.GROUPS]
        truth = sum(human) / n
        s2o = [E.stratum_lambda_s2([human[i] for i in sets[g]], [f[i] for i in sets[g]])[1] for g in H.GROUPS]
        pf = [sum(f[i] for i in sets[g]) / len(sets[g]) for g in H.GROUPS]
        out.append(f"{cat}: corpus {n}, prevalence {truth:.4f}, coder share {sum(f) / n:.4f}")
        out.append("category | target pts | c | planned n (x oracle) | mean half pts | share half > 1.25 target | coverage")
        for tgt in H.TARGETS:
            o = math.ceil(E.neyman_total(sizes, s2o, tgt))
            for c in CS:
                s2 = [max(FLOOR, c * p * (1 - p)) for p in pf]
                nn = math.ceil(E.neyman_total(sizes, s2, tgt))
                al = H.allocate(nn, sizes, s2, sizes)
                rr = random.Random(SEED)
                res = [H.run_audit(rr, sets, f, human, truth, al, None) for _ in range(REPS)]
                out.append(f"{cat} | {100 * tgt:.1f} | {c:g} | {sum(al)} ({sum(al) / o:.2f}x of {o}) | "
                           f"{100 * statistics.fmean(r[0] for r in res):.3f} | {sum(r[0] > 1.25 * tgt for r in res) / REPS:.3f} | "
                           f"{sum(r[1] for r in res) / REPS:.3f}")
                print(out[-1], flush=True)
        out.append("")
    (HERE / "h6x_label_free.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
