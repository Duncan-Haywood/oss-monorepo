"""Which interval holds its nominal 95% coverage when only 5-50 coder-negative items are hand-coded?
Same corpus, split, seed family and four coders as qual-negaudit; audit size 200; k coder-negative items and 200-k
coder-positive items, weighted by stratum share. Compares qual-negaudit's Wald interval with plus-two, Wilson and
Jeffreys-posterior intervals. Uses qual-real's cached download. Writes experiments/results.txt.

    python3 experiments/run.py      # about a minute to a few, stdlib only, seeded
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "qual-negaudit"))
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import qualneg as qn  # noqa: E402
import qualnegint as qi  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)

qa = qn.qa
g, r = qa.qg.g, qa.qg.g.r
REPS, SEED, N_GOLD = 1000, 20261024, 200
RATIOS = (0.8, 1.0, 1.25)
KS = (5, 10, 20, 50)
METHODS = ("wald", "plus_two", "wilson", "jeffreys")


def cell(human, neg, pos, truth, k, rng):
    hit = {m: 0 for m in METHODS}
    width = {m: 0.0 for m in METHODS}
    for _ in range(REPS):
        s = qi.strata_counts(human, neg, pos, rng.sample(neg, k), rng.sample(pos, N_GOLD - k))
        for m in METHODS:
            lo, hi, _ = qi.jeffreys(s, rng) if m == "jeffreys" else getattr(qi, m)(s)
            hit[m] += lo <= truth <= hi
            width[m] += hi - lo
    return {m: (hit[m] / REPS, width[m] / REPS) for m in METHODS}


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
           f"{REPS} audit draws per cell, audit size {N_GOLD}, seed {SEED}. Estimand: human negative-emotion prevalence = {truth:.4f}.",
           "Intervals are nominal 95%. wald = qual-negaudit; plus_two = +1 success +1 failure per stratum; wilson = per-stratum "
           "Wilson centre and variance; jeffreys = Beta(x+.5, n-x+.5) posterior per stratum, 1,000 posterior draws.", ""]
    res = {}
    for name, llm in coders:
        neg, pos = qa.strata(llm)
        for k in KS:
            res[name, k] = cell(human, neg, pos, truth, k, rng)
    for tag, idx, title in (("1", 0, "Coverage"), ("2", 1, "Mean width")):
        out.append(f"{tag}. {title} by coder and k")
        out.append("coder k " + " ".join(METHODS))
        for name, _ in coders:
            for k in KS:
                out.append(f"{name.replace(' ', '_')} {k} " + " ".join(f"{res[name, k][m][idx]:.3f}" for m in METHODS))
        out.append("")
    out.append("3. Worst coverage over the four coders, by k")
    out.append("k " + " ".join(METHODS))
    for k in KS:
        out.append(f"{k} " + " ".join(f"{min(res[nm, k][m][0] for nm, _ in coders):.3f}" for m in METHODS))
    out.append("")
    out.append("4. Mean width over the four coders, by k")
    out.append("k " + " ".join(METHODS))
    for k in KS:
        out.append(f"{k} " + " ".join(f"{statistics.fmean(res[nm, k][m][1] for nm, _ in coders):.3f}" for m in METHODS))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
