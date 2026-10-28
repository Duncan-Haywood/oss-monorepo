"""Milestone 6ad: Wilson interval on the effective sample size of the pooled-lambda PPI estimate (6ac's P), against the normal
intervals, on GoEmotions fear and sadness with the cached Qwen2.5-1.5B-Instruct codes. Writes h6ad_wilson_ppi.txt.

    python3 experiments/h6ad_wilson_ppi.py [reps]    # stdlib only + cached gollm_*.tsv; a few minutes
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
import h6ac_pooled_lambda as C  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402
from llmci import estimators as E  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
GROUPS, SIZES_N, SEED, Z = P.GROUPS, B.SIZES_N, B.SEED, E.Z95


def wilson_eff(est):
    """Wilson interval for an estimate treated as a proportion on n_eff = p(1-p)/se^2 labels."""
    p = min(0.9995, max(0.0005, est.value))
    n = p * (1 - p) / max(est.se, 1e-9) ** 2
    d = 1 + Z * Z / n
    mid = (p + Z * Z / (2 * n)) / d
    half = Z * math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n)) / d
    return mid - half, mid + half


def sim(sets, f, human, sizes, truth, n, rr):
    alloc = P.allocate(n, sizes, [max(1e-4, E.stratum_lambda_s2([human[i] for i in sets[g]], [f[i] for i in sets[g]])[1]) for g in GROUPS], sizes)
    strata = []
    for k, a in zip(GROUPS, alloc):
        idx = rr.sample(sets[k], a)
        strata.append((len(sets[k]), [f[i] for i in sets[k]], [human[i] for i in idx], [f[i] for i in idx]))
    h, p = E.stratified_ppi_tuned(strata, 0.0), C.pooled(strata, False)
    out = {"human normal": (Z * h.se, E.covers(h, truth)), "P normal": (Z * p.se, E.covers(p, truth))}
    for name, e in (("human Wilson (WH)", h), ("P Wilson n_eff (WE)", p)):
        lo, hi = wilson_eff(e)
        out[name] = ((hi - lo) / 2, lo <= truth <= hi)
    return out


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
    (HERE / "h6ad_wilson_ppi.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
