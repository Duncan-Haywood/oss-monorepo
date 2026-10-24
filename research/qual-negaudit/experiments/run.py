"""How few coder-negative items must an audit hand-code before the miss rate stops biasing a prevalence estimate?
Sweeps the share of the audit on coder-positive items from 1.0 (the positives-only audit of qual-labelaudit, which
covers the truth 0 times) down to 0.5, with coder-negatives weighted back in by stratum share. Same corpus, split,
seed and coders as qual-labelaudit. Uses qual-real's cached download (not committed). Writes experiments/results.txt.

    python3 experiments/run.py      # about a minute, stdlib only, seeded
"""
import math
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import qualneg as qn  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)

qa = qn.qa
qg = qa.qg
g, q = qg.g, qa.q
r = g.r
REPS, SEED = 1000, 20261024
RATIOS = (0.8, 1.0, 1.25)
SIZES = (100, 200, 400)
NEG_ITEMS = (0, 2, 5, 10, 20, 50)  # coder-negative items audited, the rest of the audit on coder-positives


def cell(human, neg, pos, truth, n_gold, n_neg, rng):
    hit = width = bias = sq = 0.0
    for _ in range(REPS):
        gp = rng.sample(pos, n_gold - n_neg)
        if n_neg == 0:
            est, se = qa.stratified(human, neg, pos, [], gp, assume_zero_negatives=True)
        else:
            est, se = qa.stratified(human, neg, pos, rng.sample(neg, n_neg), gp)
        hit += q.covers((est, se), truth)
        width += 2 * q.Z95 * se
        bias += est - truth
        sq += (est - truth) ** 2
    return hit / REPS, width / REPS, bias / REPS, math.sqrt(sq / REPS)


def main():
    ex = r.load_examples(real.fetch())
    rng = random.Random(SEED)
    order = list(range(len(ex)))
    rng.shuffle(order)
    cut = int(0.4 * len(ex))
    train, test = [ex[i] for i in order[:cut]], [ex[i] for i in order[cut:]]
    nb = r.NaiveBayes().fit([x[1] for x in train], [x[2] for x in train])
    scores = [nb.score(x[1]) for x in test]
    human = [x[2] for x in test]
    coders = [(f"nb x{ratio}", g.threshold_coder(scores, human, ratio)) for ratio in RATIOS]
    coders.append(("lexicon", [r.lexicon_code(x[1]) for x in test]))
    truth = statistics.fmean(human)
    out = [f"GoEmotions (first file): {len(ex)} examples; {len(train)} train naive-Bayes, {len(test)} evaluated. "
           f"{REPS} audit draws per cell, seed {SEED}. Estimand: human negative-emotion prevalence = {truth:.4f}.",
           "design: of n audited items, k are random coder-negative items and n-k random coder-positive items; "
           "the estimate is the exact stratum shares times the audit's mean human code per stratum "
           "(importance weights N_s/n_s). k=0 is qual-labelaudit's positives-only audit (negatives assumed to hold none).", ""]
    out.append("1. Coders on the evaluated items")
    out.append("coder coded_positive n_coder_negative miss_rate(share of corpus, human=1 but coder=0) positive_rate_in_negatives")
    strata, res = {}, {}
    for name, llm in coders:
        neg, pos = qa.strata(llm)
        strata[name] = (neg, pos)
        fn = sum(human[i] for i in neg)
        out.append(f"{name.replace(' ', '_')} {len(pos) / len(llm):.3f} {len(neg)} {fn / len(llm):.4f} {fn / len(neg):.4f}")
    out.append("")
    for name, _ in coders:
        neg, pos = strata[name]
        for n in SIZES:
            for k in NEG_ITEMS:
                res[name, n, k] = cell(human, neg, pos, truth, n, k, rng)
    for tag, idx, title in (("2", 0, "Coverage of the nominal 95% interval"), ("3", 1, "Mean width of the interval"),
                            ("4", 2, "Mean estimate minus truth (bias)"), ("5", 3, "Root-mean-square error")):
        out.append(f"{tag}. {title}")
        out.append("coder n_gold " + " ".join(f"k={k}" for k in NEG_ITEMS))
        for name, _ in coders:
            for n in SIZES:
                out.append(f"{name.replace(' ', '_')} {n} " + " ".join(
                    f"{res[name, n, k][idx]:+.4f}" if idx == 2 else f"{res[name, n, k][idx]:.3f}" for k in NEG_ITEMS))
        out.append("")
    out.append("6. Worst coverage over the four coders, by audit size and coder-negative items k")
    out.append("n_gold " + " ".join(f"k={k}" for k in NEG_ITEMS))
    for n in SIZES:
        out.append(f"{n} " + " ".join(f"{min(res[nm, n, k][0] for nm, _ in coders):.3f}" for k in NEG_ITEMS))
    out.append("")
    out.append("7. Mean RMSE over the four coders, by audit size and k")
    out.append("n_gold " + " ".join(f"k={k}" for k in NEG_ITEMS))
    for n in SIZES:
        out.append(f"{n} " + " ".join(f"{statistics.fmean(res[nm, n, k][3] for nm, _ in coders):.4f}" for k in NEG_ITEMS))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
