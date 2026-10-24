"""Milestone 4c: does a larger floor on the audit inclusion probability fix the weighted audit's
coverage at 1 to 2% prevalence? Reuses the corpus, split, coder and seed of rare_audit.py.
Writes pi_floor.txt.

    python3 experiments/pi_floor.py [reps]   # needs ~/.cache/qual-real/goemotions_{1,2,3}.csv
"""
import math
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import rare_audit as R  # noqa: E402
from llmci import estimators as E  # noqa: E402

FLOORS = (0.02, 0.05, 0.10, 0.20, 0.50)
CATS = ("grief", "pride", "disgust", "fear", "sadness")


def inclusion(w, floor, n_audit):
    """Poisson pi proportional to max(floor, w), scaled to n_audit expected, capped at 1."""
    w = [max(floor, x) for x in w]
    scale = n_audit / sum(w)
    for _ in range(20):
        pi = [min(1.0, scale * x) for x in w]
        scale *= n_audit / sum(pi)
    return [min(1.0, scale * x) for x in w]


def main():
    rows = R.load()
    rng = random.Random(R.SPLIT_SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(R.TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    tr_docs, te_docs = [R.toks(t) for t, _ in train], [R.toks(t) for t, _ in test]
    n = len(test)
    out = [f"pi floor sweep, GoEmotions corpus {n}, audit n={R.N_AUDIT} expected, {R.REPS} draws, seed {R.SEED}",
           "columns: category prevalence design coverage mean_width(points) width_vs_uniform_wilson mean_audit_positives P(no positives)", ""]
    for cat in CATS:
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
        w = [math.sqrt(rate[binof(s)] * (1 - rate[binof(s)])) for s in sc]
        pis = {fl: inclusion(w, fl, R.N_AUDIT) for fl in FLOORS}
        out.append(f"# {cat}: true prevalence {100 * truth:.2f}% ({sum(human)} of {n})")
        rr = random.Random(R.SEED)
        acc = defaultdict(lambda: {"hit": 0, "w": [], "pos": [], "none": 0})

        def rec(name, lo, hi, npos=None):
            a = acc[name]
            a["hit"] += lo <= truth <= hi
            a["w"].append(hi - lo)
            if npos is not None:
                a["pos"].append(npos)
                a["none"] += npos == 0

        for _ in range(R.REPS):
            y = [human[i] for i in rr.sample(range(n), R.N_AUDIT)]
            rec("U human (Wilson)", *R.wilson(sum(y), len(y)), sum(y))
            for fl in FLOORS:
                pi = pis[fl]
                aud = [i for i in range(n) if rr.random() < pi[i]]
                if len(aud) < 2:
                    continue
                yd = {i: human[i] for i in aud}
                np_ = sum(yd.values())
                e = E.ipw_audit(f, aud, yd, pi)
                rec(f"Q floor {fl} normal", *E.interval(e), np_)
                rec(f"Q floor {fl} Wilson", *E.ipw_audit_wilson(f, aud, yd, pi), np_)
        base = statistics.fmean(acc["U human (Wilson)"]["w"])
        for name, a in acc.items():
            m = statistics.fmean(a["w"])
            out.append(f"{cat} | {100 * truth:.2f}% | {name} | {a['hit'] / R.REPS:.3f} | {100 * m:.2f} | {m / base:.2f} | "
                       f"{statistics.fmean(a['pos']):.2f} | {a['none'] / R.REPS:.3f}")
        print("\n".join(out[-(len(acc) + 1):]), flush=True)
    (HERE / "pi_floor.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
