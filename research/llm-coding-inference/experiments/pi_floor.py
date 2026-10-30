"""Milestone 4c: does a larger floor on the inclusion probability make the weighted (uncertainty) audit
valid at rare categories? Same corpus, split, coder and calibration as rare_audit.py; only the floor on
w_i = max(floor, sqrt(q(1-q))) changes. Writes pi_floor.txt.

    python3 experiments/pi_floor.py [reps]   # downloads ~/.cache/qual-real/goemotions_{1,2,3}.csv on first use
"""
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import rare_audit as R  # noqa: E402
from llmci import estimators as E  # noqa: E402

FLOORS = (0.02, 0.05, 0.10, 0.20, 0.50)  # 0.50 = at the maximum of sqrt(q(1-q)): uniform sampling
REPS = int(sys.argv[1]) if len(sys.argv) > 1 else 500
import math  # noqa: E402


def main():
    rows = R.load()
    rng = random.Random(R.SPLIT_SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(R.TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    tr_docs, te_docs = [R.toks(t) for t, _ in train], [R.toks(t) for t, _ in test]
    n = len(test)
    out = [f"GoEmotions parts 1-3, corpus {n}; audit n={R.N_AUDIT}, {REPS} draws per cell, seed {R.SEED}",
           "columns: category | prevalence | floor | estimator | coverage | mean_width(points) | width_vs_uniform_Wilson | "
           "share of audits with zero audited positives", ""]
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
        # uniform-Wilson width, the valid baseline, from the same number of draws
        rb = random.Random(R.SEED)
        wb = statistics.fmean(
            (lambda lo_hi: lo_hi[1] - lo_hi[0])(R.wilson(sum(human[i] for i in rb.sample(range(n), R.N_AUDIT)), R.N_AUDIT))
            for _ in range(REPS))
        out.append(f"# {cat}: true prevalence {100 * truth:.2f}% ({sum(human)} of {n}); uniform Wilson width {100 * wb:.2f} points")
        for floor in FLOORS:
            w = [max(floor, math.sqrt(rate[binof(s)] * (1 - rate[binof(s)]))) for s in sc]
            scale = R.N_AUDIT / sum(w)
            for _ in range(20):
                pi = [min(1.0, scale * x) for x in w]
                scale *= R.N_AUDIT / sum(pi)
            pi = [min(1.0, scale * x) for x in w]
            rr = random.Random(R.SEED + 1)
            acc = defaultdict(lambda: [0, []])
            zero = 0
            for _ in range(REPS):
                aud = [i for i in range(n) if rr.random() < pi[i]]
                if len(aud) < 2:
                    continue
                zero += not any(human[i] for i in aud)
                yd = {i: human[i] for i in aud}
                e = E.ipw_audit(f, aud, yd, pi)
                for name, (lo, hi) in (("IPW normal", E.interval(e)), ("IPW Wilson", E.ipw_audit_wilson(f, aud, yd, pi))):
                    acc[name][0] += lo <= truth <= hi
                    acc[name][1].append(hi - lo)
            for name, (hit, ws) in acc.items():
                m = statistics.fmean(ws)
                out.append(f"{cat} | {100 * truth:.2f}% | {floor:.2f} | {name} | {hit / REPS:.3f} | {100 * m:.2f} | "
                           f"{m / wb:.2f} | {zero / REPS:.3f}")
        print("\n".join(out[-(2 * len(FLOORS) + 1):]), flush=True)
    (HERE / "pi_floor.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
