"""Milestone 6ac: repair 6ab's undercoverage of tuned stratified PPI at n = 400 on GoEmotions fear and sadness with the cached
Qwen2.5-1.5B-Instruct codes. Estimators on the same audit draws: stratified human-only, per-stratum tuned PPI (6ab), P = one pooled
lambda for all strata, PF = P with a per-stratum plus-four variance floor. Writes h6ac_pooled_lambda.txt.

    python3 experiments/h6ac_pooled_lambda.py [reps]    # stdlib only + cached gollm_*.tsv; a few minutes
"""
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift_reddit as R  # noqa: E402
import h6ab_llm_goemotions as B  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402
from llmci import estimators as E  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
GROUPS, SIZES_N, SEED = P.GROUPS, B.SIZES_N, B.SEED


def pooled(strata, floor):
    ys = [v for s in strata for v in s[2]]
    fs = [v for s in strata for v in s[3]]
    vf = E._var(fs)
    lam = 0.0 if vf == 0 else min(1.0, max(0.0, E._cov(ys, fs) / vf))
    total = sum(s[0] for s in strata)
    value = var = 0.0
    for big_ns, f_all, y, f in strata:
        n = len(y)
        r = [a - lam * b for a, b in zip(y, f)]
        w = big_ns / total
        v = E._var(r)
        if floor:
            pt = (sum(y) + 2) / (n + 4)
            v = max(v, pt * (1 - pt))
        value += w * (lam * E._mean(f_all) + E._mean(r))
        var += w * w * (1 - n / big_ns) * v / n
    return E.Est(value, math.sqrt(var))


def sim(sets, f, human, sizes, truth, n, rr):
    alloc = P.allocate(n, sizes, [max(1e-4, E.stratum_lambda_s2([human[i] for i in sets[g]], [f[i] for i in sets[g]])[1]) for g in GROUPS], sizes)
    strata = []
    for k, a in zip(GROUPS, alloc):
        idx = rr.sample(sets[k], a)
        strata.append((len(sets[k]), [f[i] for i in sets[k]], [human[i] for i in idx], [f[i] for i in idx]))
    ests = {"stratified human-only": E.stratified_ppi_tuned(strata, 0.0), "per-stratum tuned (6ab)": E.stratified_ppi_tuned(strata, None),
            "P pooled lambda": pooled(strata, False), "PF pooled + floor": pooled(strata, True)}
    return {k: (E.Z95 * e.se, E.covers(e, truth)) for k, e in ests.items()}


def main():
    out = []
    for cat in P.CATS:
        rows = P.load(cat)
        rng = random.Random(R.SPLIT_SEED)
        order = list(range(len(rows)))
        rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
        human, n = [t[2] for t in test], len(test)
        prev_tr = sum(t[2] for t in train) / len(train)
        sc = B.scores(cat, n)
        thr = sorted(sc)[int(n * (1 - min(0.5, 3 * prev_tr)))]
        coders = {"LLM score>0": [int(x > 0) for x in sc], "LLM 3x cut": [int(x > thr) for x in sc]}
        sets = {g: [i for i in range(n) if test[i][1] == g] for g in GROUPS}
        sizes = [len(sets[g]) for g in GROUPS]
        truth = sum(human) / n
        out.append(f"{cat}: corpus {n}, prevalence {truth:.4f}, {REPS} draws: coder | n | rule | coverage % | mean half-width pts")
        for name, f in coders.items():
            for na in SIZES_N:
                rr = random.Random(SEED)
                r = [sim(sets, f, human, sizes, truth, na, rr) for _ in range(REPS)]
                for rule in r[0]:
                    out.append(f"{name} | {na} | {rule} | {100 * sum(x[rule][1] for x in r) / REPS:.1f} | {100 * sum(x[rule][0] for x in r) / REPS:.3f}")
        out.append("")
        print("\n".join(out[-20:]), flush=True)
    (HERE / "h6ac_pooled_lambda.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
