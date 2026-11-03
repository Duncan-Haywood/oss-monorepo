"""Milestone 7h: does the library audit rule (7a-7c) gain on NaijaSenti with an informative coder (corpus J >= 0.3)?
7g found the zero-shot Qwen coders too weak (J <= 0.2). The in-language naive-Bayes coder (trained on the train split,
no audit labels) has J about 0.39. Same draws for the screened design and forced-pooled (tau = 2). Writes h7h_informative_coder.txt.

    python3 experiments/h7h_informative_coder.py [reps]
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import h3_llm_width as H3  # noqa: E402
import h7g_tuned_threshold as G  # noqa: E402
from llmci import audit_design as A  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
SEED = 20261101


def main():
    train, test, idx = H3.corpus()
    codes, _ = H3.coder("nb-in-language", train, test)
    f = [int(codes[i]) for i in idx]
    human = [test[i][2] for i in idx]
    truth = sum(human) / len(human)
    jc = A.informedness(human, f)
    out = [f"NaijaSenti negative share, nb-in-language coder: corpus {len(idx)} tweets, prevalence {truth:.4f}, corpus J {jc:.3f}, coder-positive share {sum(f) / len(f):.3f}; {REPS} draws",
           "n | design | coverage % | half-width pts | share using cells"]
    for n in (400, 1000):
        for name, tau in (("screen", A.TAU), ("pooled", 2.0)):
            rr = random.Random(SEED + n)
            r = [G.one(f, human, n, truth, rr, tau) for _ in range(REPS)]
            line = (f"{n} | {name} | {100 * sum(x[1] for x in r) / REPS:.1f} | {100 * sum(x[0] for x in r) / REPS:.3f} | "
                    f"{sum(x[2] for x in r) / REPS:.2f}")
            out.append(line)
            print(line, flush=True)
    (HERE / "h7h_informative_coder.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
