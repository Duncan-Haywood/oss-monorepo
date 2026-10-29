"""Milestone 6af: 6ae's strata-merging comparison on two common GoEmotions categories (admiration 8%, neutral 23%), with cached
Qwen2.5-1.5B-Instruct codes. Where does stratifying (4 strata vs 1) start to pay? Writes h6af_common_category.txt.

    python3 experiments/h6af_common_category.py [reps]    # stdlib only + cached gollm_*.tsv; a few minutes
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
CATS = ("admiration", "neutral")


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
        pg = ", ".join(f"{g} {sum(human[i] for i in sets[g]) / len(sets[g]):.3f}" for g in P.GROUPS)
        out.append(f"{cat}: corpus {n}, prevalence {truth:.4f} (by group: {pg}), {REPS} draws: coder | strata | n | rule | coverage % | mean half-width pts")
        for name, f in coders.items():
            sens = sum(a and b for a, b in zip(f, human)) / sum(human)
            spec = sum((not a) and (not b) for a, b in zip(f, human)) / (n - sum(human))
            out.append(f"# {name}: sens {sens:.3f}, spec {spec:.3f}")
            for k in M.DESIGNS:
                ids = M.merged(sets, human, k)
                for na in B.SIZES_N:
                    rr = random.Random(B.SEED)
                    r = [M.sim(ids, f, human, na, truth, rr) for _ in range(REPS)]
                    for rule in r[0]:
                        out.append(f"{name} | {k} | {na} | {rule} | {100 * sum(x[rule][1] for x in r) / REPS:.1f} | {100 * sum(x[rule][0] for x in r) / REPS:.3f}")
        out.append("")
        print("\n".join(out[-50:]), flush=True)
    (HERE / "h6af_common_category.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
