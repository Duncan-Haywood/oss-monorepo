"""Milestone 6p: a lambda-aware audit-size rule on the GoEmotions subreddit-group corpus (see h6o_reddit_sizing.py).
Per coder, three plans sized by `neyman_total` on their own residual variance (human-only lambda = 0, plain PPI
lambda = 1, oracle per-stratum lambda), each simulated with Neyman allocation. Writes h6p_lambda_sizing.txt.

    python3 experiments/h6p_lambda_sizing.py     # downloads ~/.cache/qual-real/goemotions_{1,2,3}.csv on first use; about a minute
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
from llmci import estimators as E  # noqa: E402

REPS, SEED, Z = 1000, 20261027, E.Z95
TARGETS = (0.03, 0.02)


def run(rr, sets, f, human, truth, alloc, groups, kind, lam=None):
    strata, hs = [], []
    for k, a in zip(groups, alloc):
        idx = rr.sample(sets[k], a)
        strata.append((len(sets[k]), [f[i] for i in sets[k]], [human[i] for i in idx], [f[i] for i in idx]))
        hs.append((len(sets[k]), [human[i] for i in idx]))
    if kind == "human":
        e = E.stratified_human(hs)
    elif kind == "ppi1":
        e = E.stratified_ppi(strata)
    else:
        e = E.stratified_ppi_tuned(strata, lam)
    return Z * e.se, E.covers(e, truth)


def summarise(res):
    hw = sorted(r[0] for r in res)
    return (100 * statistics.fmean(hw), 100 * hw[int(0.95 * len(hw))], sum(r[1] for r in res) / len(res))


def main():
    rows = R.load()
    rng = random.Random(R.SPLIT_SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(R.TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    human = [t[2] for t in test]
    n = len(test)
    groups = list(R.GROUPS)
    sets = {g: sorted(i for i in range(n) if test[i][1] == g) for g in groups}
    sizes = [len(sets[g]) for g in groups]
    truth = sum(human) / n
    coders = {"lr-pooled": R.make_coder(train, test),
              "lr-sports-only": R.make_coder([t for t in train if t[1] == "sports"], test),
              "lr-personal-only": R.make_coder([t for t in train if t[1] == "personal"], test)}
    out = [f"GoEmotions subreddit-group corpus {n} comments, true negative share {truth:.4f}; groups "
           + ", ".join(f"{g} {len(sets[g])}" for g in groups),
           f"{REPS} audit draws per cell, seed {SEED}. Plans sized by neyman_total on S2 of y (human), y - f (ppi1), y - lam* f (oracle lam).", "",
           "coder | per-group oracle lam | S2 human | S2 ppi1 | S2 oracle"]
    plans = {}
    for cname, f in coders.items():
        ls, s2o, s2h, s21 = [], [], [], []
        for g in groups:
            ya, fa = [human[i] for i in sets[g]], [f[i] for i in sets[g]]
            lam, s2 = E.stratum_lambda_s2(ya, fa)
            ls.append(lam), s2o.append(s2)
            s2h.append(E._var(ya)), s21.append(E._var([a - b for a, b in zip(ya, fa)]))
        plans[cname] = (ls, {"human": s2h, "ppi1": s21, "oracle": s2o})
        fm = lambda v: ", ".join(f"{x:.3f}" for x in v)
        out.append(f"{cname} | {fm(ls)} | {fm(s2h)} | {fm(s21)} | {fm(s2o)}")
    out += ["", "coder | target pts | plan | estimator | n | allocation | mean half | 95th pct half | coverage"]
    for cname, f in coders.items():
        ls, s2s = plans[cname]
        for tgt in TARGETS:
            ns, allocs = {}, {}
            for plan, s2 in s2s.items():
                ns[plan] = math.ceil(E.neyman_total(sizes, s2, tgt))
                sw = [math.sqrt(v) * N for v, N in zip(s2, sizes)]
                allocs[plan] = [min(N, max(2, round(ns[plan] * w / sum(sw)))) for w, N in zip(sw, sizes)]
            cells = [("human", "human", None), ("ppi1", "ppi1", None), ("oracle", "tuned-oracle-lam", ls),
                     ("oracle", "tuned-estimated-lam", None)]
            for plan, kind, lam in cells:
                rr = random.Random(SEED)
                est = "human" if kind == "human" else "ppi1" if kind == "ppi1" else "tuned"
                res = [run(rr, sets, f, human, truth, allocs[plan], groups, est, lam) for _ in range(REPS)]
                m, p95, cov = summarise(res)
                out.append(f"{cname} | {100 * tgt:.0f} | {plan} | {kind} | {ns[plan]} | {allocs[plan]} | {m:.2f} | {p95:.2f} | {cov:.3f}")
                print(out[-1], flush=True)
            # prediction 4: human-only estimator on the oracle plan's n and allocation
            rr = random.Random(SEED)
            res = [run(rr, sets, f, human, truth, allocs["oracle"], groups, "human") for _ in range(REPS)]
            m, p95, cov = summarise(res)
            out.append(f"{cname} | {100 * tgt:.0f} | oracle | human-estimator-on-oracle-plan | {ns['oracle']} | {allocs['oracle']} | {m:.2f} | {p95:.2f} | {cov:.3f}")
            print(out[-1], flush=True)
            out.append(f"{cname} | {100 * tgt:.0f} | n ratio oracle/human {ns['oracle'] / ns['human']:.3f}, oracle/ppi1 {ns['oracle'] / ns['ppi1']:.3f}")
    (HERE / "h6p_lambda_sizing.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
