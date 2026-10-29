"""Milestone 6ae: merge the rarest GoEmotions groups into one audit stratum (4, 3, 2, 1 strata) and compare human normal, human Wilson
and the pooled-lambda PPI Wilson-on-n_eff interval (6ad), with the cached Qwen2.5-1.5B-Instruct codes. Writes h6ae_merge_strata.txt.

    python3 experiments/h6ae_merge_strata.py [reps]    # stdlib only + cached gollm_*.tsv; a few minutes
"""
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
import h6ad_wilson_ppi as D  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402
from llmci import estimators as E  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
GROUPS, SIZES_N, SEED, Z = P.GROUPS, B.SIZES_N, B.SEED, E.Z95
DESIGNS = (4, 3, 2, 1)


def merged(sets, human, k):
    """Strata as lists of item ids: the k - 1 groups with most positives stay, the rest merge (4 -> as is; 1 -> everything)."""
    order = sorted(GROUPS, key=lambda g: -sum(human[i] for i in sets[g]))
    keep, rest = order[: k - 1], order[k - 1:]
    return [sets[g] for g in keep] + [[i for g in rest for i in sets[g]]]


def sim(strata_ids, f, human, n, truth, rr):
    sizes = [len(s) for s in strata_ids]
    s2 = [max(1e-4, E.stratum_lambda_s2([human[i] for i in s], [f[i] for i in s])[1]) for s in strata_ids]
    alloc = P.allocate(n, sizes, s2, sizes)
    strata = []
    for s, a in zip(strata_ids, alloc):
        idx = rr.sample(s, a)
        strata.append((len(s), [f[i] for i in s], [human[i] for i in idx], [f[i] for i in idx]))
    h, p = E.stratified_ppi_tuned(strata, 0.0), C.pooled(strata, False)
    out = {"human normal": (Z * h.se, E.covers(h, truth))}
    for name, e in (("human Wilson (WH)", h), ("P Wilson n_eff (WE)", p)):
        lo, hi = D.wilson_eff(e)
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
        truth = sum(human) / n
        out.append(f"{cat}: corpus {n}, prevalence {truth:.4f}, {REPS} draws: coder | strata | n | rule | coverage % | mean half-width pts")
        for name, f in coders.items():
            for k in DESIGNS:
                ids = merged(sets, human, k)
                for na in SIZES_N:
                    rr = random.Random(SEED)
                    r = [sim(ids, f, human, na, truth, rr) for _ in range(REPS)]
                    for rule in r[0]:
                        out.append(f"{name} | {k} | {na} | {rule} | {100 * sum(x[rule][1] for x in r) / REPS:.1f} | {100 * sum(x[rule][0] for x in r) / REPS:.3f}")
        out.append("")
        print("\n".join(out[-50:]), flush=True)
    (HERE / "h6ae_merge_strata.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
