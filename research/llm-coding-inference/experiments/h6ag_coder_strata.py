"""Milestone 6ag: audit strata defined by the coder's own label (coder-positive vs coder-negative) instead of by corpus group, on the four
GoEmotions categories with cached Qwen2.5-1.5B-Instruct codes. Strata prevalences then differ by a large factor, the case 6ae and 6af could
not test. Designs: 1 pooled stratum (6ae's advice), 4 corpus groups (6ad), 2 coder cells, 8 (groups x coder cell). Same rules, seed, draws and
oracle Neyman allocation as 6ae. Writes h6ag_coder_strata.txt.

    python3 experiments/h6ag_coder_strata.py [reps]    # stdlib only + cached gollm_*.tsv; a few minutes
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
import h6ae_merge_strata as M  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
CATS = ("fear", "sadness", "admiration", "neutral")


def designs(sets, f, n):
    allids = list(range(n))
    cell = {c: [i for i in allids if f[i] == c] for c in (1, 0)}
    return {
        "1 pooled": [allids],
        "4 groups": [sets[g] for g in P.GROUPS],
        "2 coder cells": [cell[1], cell[0]],
        "8 group x cell": [[i for i in sets[g] if f[i] == c] for g in P.GROUPS for c in (1, 0)],
    }


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
        prev_tr = sum(t[2] for t in train) / len(train)
        sc = B.scores(cat, n)
        thr = sorted(sc)[int(n * (1 - min(0.5, 3 * prev_tr)))]
        coders = {"LLM score>0": [int(x > 0) for x in sc], "LLM 3x cut": [int(x > thr) for x in sc]}
        sets = {g: [i for i in range(n) if test[i][1] == g] for g in P.GROUPS}
        truth = sum(human) / n
        out.append(f"{cat}: corpus {n}, prevalence {truth:.4f}, {REPS} draws: coder | design | n | rule | coverage % | mean half-width pts")
        for name, f in coders.items():
            pos = [human[i] for i in range(n) if f[i]]
            neg = [human[i] for i in range(n) if not f[i]]
            out.append(f"# {name}: coder-positive {len(pos)} items, prevalence there {sum(pos) / len(pos):.4f}; coder-negative {len(neg)}, prevalence there {sum(neg) / len(neg):.4f}")
            for dn, ids in designs(sets, f, n).items():
                ids = [s for s in ids if len(s) > 0]
                for na in B.SIZES_N:
                    rr = random.Random(B.SEED)
                    r = [M.sim(ids, f, human, na, truth, rr) for _ in range(REPS)]
                    for rule in r[0]:
                        out.append(f"{name} | {dn} | {na} | {rule} | {100 * sum(x[rule][1] for x in r) / REPS:.1f} | {100 * sum(x[rule][0] for x in r) / REPS:.3f}")
        out.append("")
        print("\n".join(out[-70:]), flush=True)
    (HERE / "h6ag_coder_strata.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
