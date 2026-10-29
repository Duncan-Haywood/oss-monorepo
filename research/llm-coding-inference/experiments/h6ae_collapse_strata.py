"""Milestone 6ae: does collapsing the rarest audit strata repair the n = 400 rare-category undercoverage (6ad)? GoEmotions fear and
sadness, cached Qwen2.5-1.5B-Instruct codes. Designs: 4 groups (6ad), 3 (two rarest by train prevalence merged), 2 (rarest pair and
commonest pair merged), 1 (simple random audit). Rules: human-only Wilson and pooled-lambda PPI with Wilson on n_eff (WE).
Writes h6ae_collapse_strata.txt.

    python3 experiments/h6ae_collapse_strata.py [reps]    # stdlib only + cached gollm_*.tsv; a few minutes
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
import h6ad_wilson_ppi as W  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402
from llmci import estimators as E  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
SEED, Z = B.SEED, E.Z95


def sim(designs, f, human, truth, n, rr):
    """designs: list of index lists (the audit strata); Neyman allocation on the oracle S2, as in 6ad."""
    sizes = [len(d) for d in designs]
    s2 = [max(1e-4, E.stratum_lambda_s2([human[i] for i in d], [f[i] for i in d])[1]) for d in designs]
    alloc = P.allocate(n, sizes, s2, sizes)
    strata = []
    for d, a in zip(designs, alloc):
        idx = rr.sample(d, a)
        strata.append((len(d), [f[i] for i in d], [human[i] for i in idx], [f[i] for i in idx]))
    h, p = E.stratified_ppi_tuned(strata, 0.0), C.pooled(strata, False)
    out = {}
    for name, e in (("human Wilson", h), ("P Wilson n_eff", p)):
        lo, hi = W.wilson_eff(e)
        out[name] = ((hi - lo) / 2, lo <= truth <= hi)
    out["P normal"] = (Z * p.se, E.covers(p, truth))
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
        prev_g = {g: sum(t[2] for t in train if t[1] == g) / max(1, sum(t[1] == g for t in train)) for g in P.GROUPS}
        rank = sorted(P.GROUPS, key=prev_g.get)  # rarest first, by train prevalence (label-free of the test audit)
        sc = B.scores(cat, n)
        thr = sorted(sc)[int(n * (1 - min(0.5, 3 * prev_tr)))]
        coders = {"LLM score>0": [int(x > 0) for x in sc], "LLM 3x cut": [int(x > thr) for x in sc]}
        sets = {g: [i for i in range(n) if test[i][1] == g] for g in P.GROUPS}
        cat_sets = lambda *gs: [i for g in gs for i in sets[g]]  # noqa: E731
        designs = {
            "4 groups": [sets[g] for g in P.GROUPS],
            "3 (two rarest merged)": [cat_sets(rank[0], rank[1]), sets[rank[2]], sets[rank[3]]],
            "2 (rarest pair | commonest pair)": [cat_sets(rank[0], rank[1]), cat_sets(rank[2], rank[3])],
            "1 (simple random)": [list(range(n))],
        }
        truth = sum(human) / n
        out.append(f"{cat}: corpus {n}, prevalence {truth:.4f}, groups rarest first by train prevalence: " + ", ".join(f"{g} {prev_g[g]:.4f}" for g in rank)
                   + f"; {REPS} draws: coder | n | design | rule | coverage % | mean half-width pts")
        for name, f in coders.items():
            for na in B.SIZES_N:
                for dname, ds in designs.items():
                    rr = random.Random(SEED)
                    r = [sim(ds, f, human, truth, na, rr) for _ in range(REPS)]
                    for rule in r[0]:
                        out.append(f"{name} | {na} | {dname} | {rule} | {100 * sum(x[rule][1] for x in r) / REPS:.1f} | {100 * sum(x[rule][0] for x in r) / REPS:.3f}")
        out.append("")
        print("\n".join(out[-3:]), flush=True)
    (HERE / "h6ae_collapse_strata.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
