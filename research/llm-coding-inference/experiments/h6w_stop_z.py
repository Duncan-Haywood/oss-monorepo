"""Milestone 6w: standardised error (estimate - truth) / reported se at the stop of the rare-category sequential audit (rule A of
h6v_alpha_spend.py), against a fixed-n audit of the same size. Writes h6w_stop_z.txt.

    python3 experiments/h6w_stop_z.py     # a few minutes; reuses the GoEmotions cache of the h6r..h6v experiments
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
import h6r_rare_pilot as P  # noqa: E402
from llmci import estimators as E  # noqa: E402

REPS, SEED = 500, 20261030
START, BATCH, CAP, FLOOR = 400, 100, 6000, 1e-4
GROUPS = P.GROUPS


def strata_for(sets, f, human, sizes, idxs):
    return [(sizes[j], [f[i] for i in sets[k]], [human[i] for i in idxs[j]], [f[i] for i in idxs[j]])
            for j, k in enumerate(GROUPS)]


def sequential(rr, sets, f, human, sizes, tgt):
    order = [rr.sample(sets[k], len(sets[k])) for k in GROUPS]
    tot = sum(sizes)
    cnt = [min(N, max(10, round(START * N / tot))) for N in sizes]
    while True:
        strata = strata_for(sets, f, human, sizes, [order[j][:cnt[j]] for j in range(len(GROUPS))])
        e = E.stratified_ppi_tuned(strata)
        s2 = []
        for j, (_, _, y, fp) in enumerate(strata):
            vf = E._var(strata[j][1])
            lam = 0.0 if vf == 0 else min(1.0, max(0.0, E._cov(y, fp) / vf))
            s2.append(max(FLOOR, E._var([a - lam * b for a, b in zip(y, fp)])))
        n = sum(cnt)
        if E.Z95 * e.se <= tgt or n >= CAP:
            return n, e, cnt
        w = [N * v ** 0.5 for N, v in zip(sizes, s2)]
        for _ in range(min(BATCH, CAP - n)):
            cand = [j for j in range(len(GROUPS)) if cnt[j] < sizes[j]]
            if not cand:
                break
            j = max(cand, key=lambda j: w[j] / (cnt[j] + 1))
            cnt[j] += 1


def corr(a, b):
    ma, mb = statistics.fmean(a), statistics.fmean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))
    return num / den if den else float("nan")


def summarise(ts, ses, errs):
    return (f"{statistics.pstdev(ts):.3f} | {statistics.fmean(ts):+.3f} | {statistics.fmean(ses) * 100:.3f} | "
            f"{statistics.pstdev(errs) * 100:.3f} | {corr(ses, [abs(x) for x in errs]):+.3f}")


def main():
    out = ["category | target pts | audit | sd t | mean t | mean se pts | sd error pts | corr(se, |error|)"]
    for cat in P.CATS:
        rows = P.load(cat)
        rng = random.Random(R.SPLIT_SEED)
        order = list(range(len(rows)))
        rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
        human, n = [t[2] for t in test], len(test)
        f = P.coder(train, test)
        truth = sum(human) / n
        sets = {g: [i for i in range(n) if test[i][1] == g] for g in GROUPS}
        sizes = [len(sets[g]) for g in GROUPS]
        for tgt in P.TARGETS:
            rr = random.Random(SEED)
            st, fx = ([], [], []), ([], [], [])
            for _ in range(REPS):
                m, e, cnt = sequential(rr, sets, f, human, sizes, tgt)
                for acc, est in ((st, e),):
                    acc[0].append((est.value - truth) / est.se if est.se > 0 else 0.0)
                    acc[1].append(est.se)
                    acc[2].append(est.value - truth)
                idxs = [rr.sample(sets[k], c) for k, c in zip(GROUPS, cnt)]
                g = E.stratified_ppi_tuned(strata_for(sets, f, human, sizes, idxs))
                fx[0].append((g.value - truth) / g.se if g.se > 0 else 0.0)
                fx[1].append(g.se)
                fx[2].append(g.value - truth)
            out.append(f"{cat} | {100 * tgt:.1f} | stopped | {summarise(*st)}")
            out.append(f"{cat} | {100 * tgt:.1f} | fixed n (same sizes) | {summarise(*fx)}")
            print(out[-2], "\n", out[-1], flush=True)
    (HERE / "h6w_stop_z.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
