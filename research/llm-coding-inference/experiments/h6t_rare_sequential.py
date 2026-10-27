"""Milestone 6t: sequential audit (6c design) at a rare category, GoEmotions subreddit groups, with and without a
minimum-positives guard on stopping. Same corpus, coder and strata as h6r_rare_pilot.py. Writes h6t_rare_sequential.txt.

    python3 experiments/h6t_rare_sequential.py     # downloads ~/.cache/qual-real/goemotions_{1,2,3}.csv on first use; a few minutes
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

REPS, SEED, Z = 500, 20261030, E.Z95
CATS, TARGETS = P.CATS, P.TARGETS
START, BATCH, CAP, FLOOR = 400, 100, 6000, 1e-4
RULES = (("A plain", 0), ("B >=20 pos", 20), ("C >=40 pos", 40))
GROUPS = P.GROUPS


def sequential(rr, sets, f, human, sizes, tgt, minpos):
    order = [rr.sample(sets[k], len(sets[k])) for k in GROUPS]
    tot = sum(sizes)
    cnt = [min(N, max(10, round(START * N / tot))) for N in sizes]
    while True:
        strata, s2 = [], []
        for j, k in enumerate(GROUPS):
            idx = order[j][:cnt[j]]
            strata.append((sizes[j], [f[i] for i in sets[k]], [human[i] for i in idx], [f[i] for i in idx]))
        e = E.stratified_ppi_tuned(strata)
        for j, (_, _, y, fp) in enumerate(strata):
            vf = E._var(strata[j][1])
            lam = 0.0 if vf == 0 else min(1.0, max(0.0, E._cov(y, fp) / vf))
            s2.append(max(FLOOR, E._var([a - lam * b for a, b in zip(y, fp)])))
        n = sum(cnt)
        pos = sum(sum(s[2]) for s in strata)
        if (Z * e.se <= tgt and pos >= minpos) or n >= CAP:
            return n, Z * e.se, E.covers(e, truth_of(human)), pos
        w = [N * v ** 0.5 for N, v in zip(sizes, s2)]
        for _ in range(min(BATCH, CAP - n)):
            cand = [j for j in range(len(GROUPS)) if cnt[j] < sizes[j]]
            if not cand:
                break
            j = max(cand, key=lambda j: w[j] / (cnt[j] + 1))
            cnt[j] += 1


_TRUTH = {}


def truth_of(human):
    return _TRUTH.setdefault(id(human), sum(human) / len(human))


def main():
    out = []
    for cat in CATS:
        rows = P.load(cat)
        rng = random.Random(R.SPLIT_SEED)
        order = list(range(len(rows)))
        rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
        human, n = [t[2] for t in test], len(test)
        f = P.coder(train, test)
        sets = {g: [i for i in range(n) if test[i][1] == g] for g in GROUPS}
        sizes = [len(sets[g]) for g in GROUPS]
        s2o = [E.stratum_lambda_s2([human[i] for i in sets[g]], [f[i] for i in sets[g]])[1] for g in GROUPS]
        out.append(f"{cat}: corpus {n}, prevalence {sum(human) / n:.4f}, positives {sum(human)}")
        out.append("category | target pts | rule | mean n (oracle) | sd n | mean half pts | share stopped with <20 pos | share at cap | coverage")
        for tgt in TARGETS:
            o = math.ceil(E.neyman_total(sizes, s2o, tgt))
            for name, mp in RULES:
                rr = random.Random(SEED)
                res = [sequential(rr, sets, f, human, sizes, tgt, mp) for _ in range(REPS)]
                out.append(f"{cat} | {100 * tgt:.1f} | {name} | {statistics.fmean(r[0] for r in res):.0f} ({o}) | "
                           f"{statistics.pstdev(r[0] for r in res):.0f} | {100 * statistics.fmean(r[1] for r in res):.3f} | "
                           f"{sum(r[3] < 20 for r in res) / REPS:.3f} | {sum(r[0] >= CAP for r in res) / REPS:.3f} | {sum(r[2] for r in res) / REPS:.3f}")
                print(out[-1], flush=True)
        out.append("")
    (HERE / "h6t_rare_sequential.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
