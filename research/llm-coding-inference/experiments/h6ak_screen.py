"""Milestone 6ak: a screening step. A 30% pilot (pilot-in-audit, as 6ai) estimates the coder's informedness J = sensitivity + specificity - 1; if
J_hat >= TAU the audit uses two coder cells with a 0.35 floor (6ai's sim_floor design), otherwise one pooled stratum (pilot + fresh items to n).
Compared with always-pooled and always-cells(0.35) on the 6ai GoEmotions categories (admiration, neutral, fear, sadness; score>0 coder) and the 6aj
NaijaSenti subsample (three Qwen coders). Writes h6ak_screen.txt.

    python3 experiments/h6ak_screen.py [reps]    # needs network for the NaijaSenti files; minutes
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift_reddit as R  # noqa: E402
import h3_llm_width as H3  # noqa: E402
import h6ab_llm_goemotions as B  # noqa: E402
import h6ae_merge_strata as M  # noqa: E402
import h6ah_pilot_cells as H  # noqa: E402
import h6ai_floor_indep as F  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
TAU = 0.3
MODELS = ("Qwen2.5-0.5B-Instruct", "Qwen2.5-1.5B-Instruct", "Qwen2.5-3B-Instruct")


def jhat(pilot, f, human):
    pos = [i for i in pilot if human[i]]
    neg = [i for i in pilot if not human[i]]
    if not pos or not neg:
        return 0.0
    return sum(f[i] for i in pos) / len(pos) + sum(1 - f[i] for i in neg) / len(neg) - 1


def sim_screen(cells, f, human, n, truth, rr, floor=0.35):
    pool = [i for s in cells for i in s]
    pilot = set(rr.sample(pool, round(F.PILOT_SHARE * n)))
    if jhat(pilot, f, human) >= TAU:
        sizes = [len(s) for s in cells]
        alloc = F.floored(P.allocate(n, sizes, F.est_s2(cells, f, human, pilot), sizes), sizes, n, floor)
        picked = []
        for s, a in zip(cells, alloc):
            have = [i for i in s if i in pilot]
            rest = [i for i in s if i not in pilot]
            picked.append(have + rr.sample(rest, max(0, min(len(rest), a - len(have)))))
        return H.score(H.build(cells, picked, f, human), truth), 1
    rest = [i for i in pool if i not in pilot]
    picked = [sorted(pilot) + rr.sample(rest, max(0, n - len(pilot)))]
    return H.score(H.build([pool], picked, f, human), truth), 0


def run(label, f, human, out):
    n = len(human)
    truth = sum(human) / n
    pool = list(range(n))
    cells = [s for s in ([i for i in range(n) if f[i] == c] for c in (1, 0)) if s]
    designs = {
        "1 pooled": lambda k, rr: (M.sim([pool], f, human, k, truth, rr), 0),
        "cells floor 0.35": lambda k, rr: (F.sim_floor(cells, f, human, k, truth, rr, 0.35)[0], 1),
        "screen (J_hat >= 0.3)": lambda k, rr: sim_screen(cells, f, human, k, truth, rr),
    }
    j = sum(f[i] for i in pool if human[i]) / max(1, sum(human)) + sum(1 - f[i] for i in pool if not human[i]) / max(1, n - sum(human)) - 1
    out.append(f"{label}: corpus {n}, prevalence {truth:.4f}, true J {j:.3f}: design | n | rule | coverage % | mean half-width pts | share of draws using cells")
    for dn, fn in designs.items():
        for k in B.SIZES_N:
            rr = random.Random(B.SEED)
            r = [fn(k, rr) for _ in range(REPS)]
            for rule in r[0][0]:
                out.append(f"{label} | {dn} | {k} | {rule} | {100 * sum(x[0][rule][1] for x in r) / REPS:.1f} | {100 * sum(x[0][rule][0] for x in r) / REPS:.3f} | {sum(x[1] for x in r) / REPS:.2f}")
    print("\n".join(out[-40:]), flush=True)


def main():
    out = []
    for cat in ("admiration", "neutral", "fear", "sadness"):
        rows = P.load(cat)
        rng = random.Random(R.SPLIT_SEED)
        order = list(range(len(rows)))
        rng.shuffle(order)
        test = [rows[i] for i in order[int(R.TRAIN_SHARE * len(rows)):]]
        sc = B.scores(cat, len(test))
        run(f"GoEmotions {cat}", [int(x > 0) for x in sc], [t[2] for t in test], out)
    _, test_all, idx = H3.corpus()
    sc = {m: {int(a): float(b) for a, b in (l.split("\t") for l in (HERE / f"llm_scores_{m}.tsv").read_text().splitlines())} for m in MODELS}
    idx = [i for i in idx if all(i in s for s in sc.values())]
    human = [test_all[i][2] for i in idx]
    for m in MODELS:
        run(f"NaijaSenti {m}", [int(sc[m][i] > 0) for i in idx], human, out)
    (HERE / "h6ak_screen.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
