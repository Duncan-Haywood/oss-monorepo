"""Milestone 4d: a label-free rule for the pi floor, floor = clip(5 * qbar, 0.02, 0.10), where qbar is the corpus
mean of the calibrated coder probability. Same corpus, split, coder and calibration as pi_floor.py. Writes floor_rule.txt.

    python3 experiments/floor_rule.py [reps]   # downloads ~/.cache/qual-real/goemotions_{1,2,3}.csv on first use
"""
import math
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import rare_audit as R  # noqa: E402
from llmci import estimators as E  # noqa: E402

REPS = int(sys.argv[1]) if len(sys.argv) > 1 else 500


def main():
    rows = R.load()
    rng = random.Random(R.SPLIT_SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(R.TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    tr_docs, te_docs = [R.toks(t) for t, _ in train], [R.toks(t) for t, _ in test]
    n = len(test)
    out = [f"GoEmotions parts 1-3, corpus {n}; audit n={R.N_AUDIT}, {REPS} draws per cell, seed {R.SEED}; floor = clip(5*qbar, 0.02, 0.10)",
           "columns: category | prevalence | qbar | floor | coverage | mean_width(points) | width_vs_uniform_Wilson | zero-positive audit share", ""]
    for cat in R.CATS:
        ytr = [l[cat] for _, l in train]
        human = [l[cat] for _, l in test]
        truth = sum(human) / n
        nb = R.NB().fit(tr_docs, ytr)
        s_tr = sorted(((nb.score(d), v) for d, v in zip(tr_docs, ytr)), key=lambda x: x[0])
        k = max(1, round(3 * sum(ytr) / len(ytr) * len(s_tr)))
        thr = s_tr[-k][0]
        edges = [s_tr[int(len(s_tr) * j / 10)][0] for j in range(1, 10)]

        def binof(s, edges=edges):
            return sum(s >= e for e in edges)
        rate, cntb = [0.0] * 10, [0] * 10
        for s, v in s_tr:
            b = binof(s)
            cntb[b] += 1
            rate[b] += v
        rate = [(rate[b] + 0.5) / (cntb[b] + 1) for b in range(10)]
        sc = [nb.score(d) for d in te_docs]
        f = [int(s >= thr) for s in sc]
        qs = [rate[binof(s)] for s in sc]
        qbar = statistics.fmean(qs)
        floor = min(0.10, max(0.02, 5 * qbar))
        rb = random.Random(R.SEED)
        wb = statistics.fmean(
            (lambda lh: lh[1] - lh[0])(R.wilson(sum(human[i] for i in rb.sample(range(n), R.N_AUDIT)), R.N_AUDIT))
            for _ in range(REPS))
        w = [max(floor, math.sqrt(q * (1 - q))) for q in qs]
        scale = R.N_AUDIT / sum(w)
        for _ in range(20):
            pi = [min(1.0, scale * x) for x in w]
            scale *= R.N_AUDIT / sum(pi)
        pi = [min(1.0, scale * x) for x in w]
        rr = random.Random(R.SEED + 1)
        hit, ws, zero = 0, [], 0
        for _ in range(REPS):
            aud = [i for i in range(n) if rr.random() < pi[i]]
            if len(aud) < 2:
                continue
            zero += not any(human[i] for i in aud)
            e = E.ipw_audit(f, aud, {i: human[i] for i in aud}, pi)
            lo, hi = E.interval(e)
            hit += lo <= truth <= hi
            ws.append(hi - lo)
        m = statistics.fmean(ws)
        out.append(f"{cat} | {100 * truth:.2f}% | {100 * qbar:.2f}% | {floor:.3f} | {hit / REPS:.3f} | {100 * m:.2f} | {m / wb:.2f} | {zero / REPS:.3f}")
        print(out[-1], flush=True)
    (HERE / "floor_rule.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
