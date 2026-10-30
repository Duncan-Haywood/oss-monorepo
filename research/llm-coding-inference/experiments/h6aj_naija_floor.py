"""Milestone 6aj: does 6ai's coder-cell floor rule transfer to a second corpus? NaijaSenti (6,000-tweet subsample of h3_llm_width.corpus(),
target = negative share, common prevalence) with the three cached zero-shot Qwen coders (score > 0). Designs: 1 pooled stratum, 2 coder cells with
oracle Neyman allocation, 2 coder cells with a 30% pilot and a floor of 0.2 or 0.35 of n (6ai's sim_floor). Same rules/seed as 6ai. Writes h6aj_naija_floor.txt.

    python3 experiments/h6aj_naija_floor.py [reps]    # needs network for the NaijaSenti files; minutes
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import h3_llm_width as H3  # noqa: E402
import h6ab_llm_goemotions as B  # noqa: E402
import h6ae_merge_strata as M  # noqa: E402
import h6ai_floor_indep as F  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
MODELS = ("Qwen2.5-0.5B-Instruct", "Qwen2.5-1.5B-Instruct", "Qwen2.5-3B-Instruct")
SIZES = (400, 1000)


def main():
    _, test_all, idx = H3.corpus()
    sc = {m: {int(a): float(b) for a, b in (l.split("\t") for l in (HERE / f"llm_scores_{m}.tsv").read_text().splitlines())} for m in MODELS}
    idx = [i for i in idx if all(i in s for s in sc.values())]
    test = [test_all[i] for i in idx]
    n = len(test)
    human = [t[2] for t in test]
    truth = sum(human) / n
    out = [f"NaijaSenti subsample {n} tweets, negative share {truth:.4f}, {REPS} draws: coder | design | n | rule | coverage % | mean half-width pts | mean humans used"]
    for m in MODELS:
        f = [int(sc[m][idx[i]] > 0) for i in range(n)]
        cells = [s for s in ([i for i in range(n) if f[i] == c] for c in (1, 0)) if s]
        out.append(f"{m}: coder-positive {len(cells[0])}, agreement {sum(a == b for a, b in zip(f, human)) / n:.3f}")
        designs = {
            "1 pooled": lambda k, rr: (M.sim([list(range(n))], f, human, k, truth, rr), k),
            "2 cells oracle": lambda k, rr: (M.sim(cells, f, human, k, truth, rr), k),
            "pilot floor 0.2": lambda k, rr: F.sim_floor(cells, f, human, k, truth, rr, 0.2),
            "pilot floor 0.35": lambda k, rr: F.sim_floor(cells, f, human, k, truth, rr, 0.35),
        }
        for dn, fn in designs.items():
            for k in SIZES:
                rr = random.Random(B.SEED)
                r = [fn(k, rr) for _ in range(REPS)]
                used = sum(x[1] for x in r) / REPS
                for rule in r[0][0]:
                    out.append(f"{m} | {dn} | {k} | {rule} | {100 * sum(x[0][rule][1] for x in r) / REPS:.1f} | {100 * sum(x[0][rule][0] for x in r) / REPS:.3f} | {used:.0f}")
        print("\n".join(out[-30:]), flush=True)
    (HERE / "h6aj_naija_floor.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
