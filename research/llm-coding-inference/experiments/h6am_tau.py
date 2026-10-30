"""Milestone 6am: sensitivity of 6al's guarded screen (J_hat >= TAU and >= 20 pilot positives) to TAU. TAU in {0.1, 0.2, 0.3, 0.4, 0.5}, G = 20.
Same data, coders, seed, rules and draws as 6al. Writes h6am_tau.txt.

    python3 experiments/h6am_tau.py [reps]    # needs network for the data files; minutes
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE))
import group_shift_reddit as R  # noqa: E402
import h3_llm_width as H3  # noqa: E402
import h6ab_llm_goemotions as B  # noqa: E402
import h6ak_screen as K  # noqa: E402
import h6al_guard as G  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
TAUS = (0.1, 0.2, 0.3, 0.4, 0.5)


def run(label, f, human, out):
    n = len(human)
    truth = sum(human) / n
    cells = [s for s in ([i for i in range(n) if f[i] == c] for c in (1, 0)) if s]
    out.append(f"{label}: corpus {n}, prevalence {truth:.4f}: TAU | n | rule | coverage % | mean half-width pts | share of draws using cells")
    for tau in TAUS:
        K.TAU = tau
        for k in B.SIZES_N:
            rr = random.Random(B.SEED)
            r = [G.sim_guard(cells, f, human, k, truth, rr, 20) for _ in range(REPS)]
            for rule in r[0][0]:
                out.append(f"{label} | {tau} | {k} | {rule} | {100 * sum(x[0][rule][1] for x in r) / REPS:.1f} | {100 * sum(x[0][rule][0] for x in r) / REPS:.3f} | {sum(x[1] for x in r) / REPS:.2f}")
    print("\n".join(out[-60:]), flush=True)


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
    sc = {m: {int(a): float(b) for a, b in (l.split("\t") for l in (HERE / f"llm_scores_{m}.tsv").read_text().splitlines())} for m in K.MODELS}
    idx = [i for i in idx if all(i in s for s in sc.values())]
    human = [test_all[i][2] for i in idx]
    for m in K.MODELS:
        run(f"NaijaSenti {m}", [int(sc[m][i] > 0) for i in idx], human, out)
    (HERE / "h6am_tau.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
