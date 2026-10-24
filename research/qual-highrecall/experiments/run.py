"""Does a low audit rate for coder-negatives pay when the coder has high recall? Same design, corpus, split and seed as
qual-lowrate, but the naive-Bayes cut-off codes 2, 3 and 4 times the human positive share, so recall is high and
precision low. Writes experiments/results.txt.

    python3 experiments/run.py      # about a minute, stdlib only, seeded
"""
import statistics
import sys
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "qual-lowrate"))
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import qualrate as qr  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)

qa = qr.qa
qg = qa.qg
g, q = qg.g, qa.q
r = g.r
REPS, SEED = 1000, 20261023
RATIOS = (2.0, 3.0, 4.0)
SIZES = (100, 200, 400)
SHARES = (0.0, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5)


def cell(human, neg, pos, truth, n_gold, share, rng):
    hit = width = bias = skipped = 0
    for _ in range(REPS):
        gn, gp = qr.draw(n_gold, share, neg, pos, rng)
        if share > 0 and (len(gn) < 2 or len(gp) < 2):
            skipped += 1
            continue
        est, se = qa.stratified(human, neg, pos, gn, gp, assume_zero_negatives=share == 0)
        hit += q.covers((est, se), truth)
        width += 2 * q.Z95 * se
        bias += est - truth
    m = REPS - skipped
    return hit / m, width / m, bias / m


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
    truth = statistics.fmean(human)
    out = [f"GoEmotions (first file): {len(ex)} examples; {len(train)} train naive-Bayes, {len(test)} evaluated. "
           f"{REPS} audit draws per cell, seed {SEED}. Estimand: human negative-emotion prevalence = {truth:.4f}.", ""]
    out.append("1. Coders on the evaluated items")
    out.append("coder coded_positive precision recall miss_rate neyman_neg_share")
    strata, res = {}, {}
    for name, llm in coders:
        neg, pos = qa.strata(llm)
        strata[name] = (neg, pos)
        tp = sum(human[i] for i in pos)
        fn = sum(human[i] for i in neg)
        out.append(f"{name.replace(' ', '_')} {len(pos) / len(llm):.3f} {tp / len(pos):.3f} {tp / (tp + fn):.3f} "
                   f"{fn / len(llm):.4f} {1 - qa.allocation(human, neg, pos):.3f}")
    out.append("")
    for name, _ in coders:
        neg, pos = strata[name]
        for n in SIZES:
            for s in SHARES:
                res[name, n, s] = cell(human, neg, pos, truth, n, s, rng)
    for tag, idx, title in (("2", 0, "Coverage of the nominal 95% interval"), ("3", 1, "Mean width of the interval"),
                            ("4", 2, "Mean estimate minus truth (bias)")):
        out.append(f"{tag}. {title}")
        out.append("coder n_gold " + " ".join(f"neg{s}" for s in SHARES))
        for name, _ in coders:
            for n in SIZES:
                out.append(f"{name.replace(' ', '_')} {n} " + " ".join(
                    f"{res[name, n, s][idx]:+.4f}" if idx == 2 else f"{res[name, n, s][idx]:.3f}" for s in SHARES))
        out.append("")
    out.append("5. Mean interval width over the three coders, by negative share (columns) and audit size (rows)")
    out.append("n_gold " + " ".join(f"neg{s}" for s in SHARES))
    for n in SIZES:
        out.append(f"{n} " + " ".join(f"{statistics.fmean(res[nm, n, s][1] for nm, _ in coders):.4f}" for s in SHARES))
    out.append("")
    out.append("6. Worst coverage over the three coders")
    out.append("n_gold " + " ".join(f"neg{s}" for s in SHARES))
    for n in SIZES:
        out.append(f"{n} " + " ".join(f"{min(res[nm, n, s][0] for nm, _ in coders):.3f}" for s in SHARES))
    out.append("")
    out.append("7. Baseline with no coder: width of a simple random audit of n items (Wald, no finite-population correction)")
    out.append("n_gold width")
    for n in SIZES:
        out.append(f"{n} {2 * q.Z95 * (truth * (1 - truth) / n) ** 0.5:.4f}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
