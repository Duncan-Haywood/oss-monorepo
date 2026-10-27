"""Milestone 6o: the audit-size rule (6a to 6f) on a second corpus, GoEmotions comments grouped by subreddit kind
(`group_shift_reddit.py`). Part 1: plug-in vs simulated stratified-PPI half-width at three allocations. Part 2: the
Neyman rule's n for a 3- and a 2-point half-width target. Writes h6o_reddit_sizing.txt.

    python3 experiments/h6o_reddit_sizing.py     # downloads ~/.cache/qual-real/goemotions_{1,2,3}.csv on first use; about a minute
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
import h5_plugin as H5  # noqa: E402
from llmci import estimators as E  # noqa: E402

REPS, SEED, Z = 1000, 20261026, E.Z95
TARGETS = (0.03, 0.02)


def draw(rr, sets, f, human, truth, alloc, groups):
    strata = []
    for k, a in zip(groups, alloc):
        idx = rr.sample(sets[k], a)
        strata.append((len(sets[k]), [f[i] for i in sets[k]], [human[i] for i in idx], [f[i] for i in idx]))
    e = E.stratified_ppi(strata)
    return Z * e.se, E.covers(e, truth)


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
    coders = {"lr-pooled": R.make_coder(train, test),
              "lr-sports-only": R.make_coder([t for t in train if t[1] == "sports"], test),
              "lr-personal-only": R.make_coder([t for t in train if t[1] == "personal"], test)}
    truth = sum(human) / n
    out = [f"GoEmotions subreddit-group corpus {n} comments, true negative share {truth:.4f}; groups "
           + ", ".join(f"{g} {len(sets[g])}" for g in groups),
           f"{REPS} audit draws per cell, seed {SEED}. Part 1: plug-in half-width vs mean simulated half-width of stratified PPI, points. "
           "Part 2: audit-size rule (Neyman, library neyman_total) at 3- and 2-point targets.", "",
           "PART 1 design | coder | per-stratum S2 | predicted half | simulated half | ratio sim/pred | coverage"]
    stats = {}
    for cname, f in coders.items():
        st = [H5.stratum_stats([human[i] for i in sets[g]], [f[i] for i in sets[g]]) for g in groups]
        s2 = [s[3] for s in st]
        stats[cname] = s2
        sw = [N * math.sqrt(v) for N, v in zip(sizes, s2)]
        ney400 = [max(2, round(400 * w / sum(sw))) for w in sw]
        for dname, alloc in {"B equal quota": [100] * 4, "C 70% sports": [280, 40, 40, 40], "N Neyman n=400": ney400}.items():
            pred = H5.predicted_half(sizes, s2, alloc)
            rr = random.Random(SEED)
            res = [draw(rr, sets, f, human, truth, alloc, groups) for _ in range(REPS)]
            sim = statistics.fmean(r[0] for r in res)
            out.append(f"{dname} {alloc} | {cname} | {', '.join(f'{v:.3f}' for v in s2)} | {100 * pred:.2f} | {100 * sim:.2f} | "
                       f"{sim / pred:.3f} | {sum(r[1] for r in res) / REPS:.3f}")
            print(out[-1], flush=True)
    out += ["", "PART 2 coder | target pts | rule n | allocation | simulated mean half | 95th pct half | coverage | human-only strat n, same target | PPI n / human n"]
    for cname, f in coders.items():
        s2 = stats[cname]
        sy = [statistics.pvariance([human[i] for i in sets[g]]) * len(sets[g]) / (len(sets[g]) - 1) for g in groups]
        for tgt in TARGETS:
            nt = math.ceil(E.neyman_total(sizes, s2, tgt))
            nh = math.ceil(E.neyman_total(sizes, sy, tgt))
            sw = [math.sqrt(v) * N for v, N in zip(s2, sizes)]
            alloc = [min(N, max(2, round(nt * w / sum(sw)))) for w, N in zip(sw, sizes)]
            rr = random.Random(SEED + 1)
            res = [draw(rr, sets, f, human, truth, alloc, groups) for _ in range(REPS)]
            hw = sorted(r[0] for r in res)
            out.append(f"{cname} | {100 * tgt:.0f} | {nt} | {alloc} | {100 * statistics.fmean(hw):.2f} | {100 * hw[int(0.95 * REPS)]:.2f} | "
                       f"{sum(r[1] for r in res) / REPS:.3f} | {nh} | {nt / nh:.3f}")
            print(out[-1], flush=True)
    (HERE / "h6o_reddit_sizing.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
