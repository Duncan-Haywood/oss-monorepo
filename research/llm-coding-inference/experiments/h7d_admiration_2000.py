"""Milestone 7d: 2,000 draws of the library audit (plan_audit -> audit_interval) on GoEmotions admiration, n = 1000, to settle 7c's
92.0% (500 draws, 6al had 94.6%). Seed B.SEED + 7 (independent of 7c's draws). Writes h7d_admiration_2000.txt.

    python3 experiments/h7d_admiration_2000.py [reps]    # needs network for the data files; about 8 min
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import group_shift_reddit as R  # noqa: E402
import h6ab_llm_goemotions as B  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402
from h7c_end_to_end import one  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 2000
N = 1000


def main():
    rows = P.load("admiration")
    rng = random.Random(R.SPLIT_SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    test = [rows[i] for i in order[int(R.TRAIN_SHARE * len(rows)):]]
    sc = B.scores("admiration", len(test))
    f, human = [int(x > 0) for x in sc], [t[2] for t in test]
    truth = sum(human) / len(human)
    rr = random.Random(B.SEED + 7)
    r = [one(f, human, N, truth, rr) for _ in range(REPS)]
    cov = sum(x[1] for x in r) / REPS
    se = (cov * (1 - cov) / REPS) ** 0.5
    out = [f"GoEmotions admiration n={N}, {REPS} draws, seed {B.SEED + 7}: coverage {100 * cov:.1f}% (se {100 * se:.1f}), "
           f"half-width {100 * sum(x[0] for x in r) / REPS:.3f} pts, cells used {sum(x[2] for x in r) / REPS:.2f}"]
    for k in range(0, REPS, 500):
        c = r[k:k + 500]
        out.append(f"draws {k + 1}-{k + len(c)}: coverage {100 * sum(x[1] for x in c) / len(c):.1f}%")
    print("\n".join(out))
    (HERE / "h7d_admiration_2000.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
