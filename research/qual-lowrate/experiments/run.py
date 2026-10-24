"""How low can the audit rate for coder-negative items go? Negative-emotion prevalence on GoEmotions: audits of n
items with a given share drawn from coder-negatives (0 = positives only), weighted back by stratum size. Uses
qual-real's cached download (not committed). Writes experiments/results.txt.

    python3 experiments/run.py      # about a minute, stdlib only, seeded
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import qualrate as qr  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)

qa = qr.qa
qg = qa.qg
g, q = qg.g, qa.q
r = g.r
REPS, SEED = 1000, 20261023
RATIOS = (0.8, 1.0, 1.25)
SIZES = (100, 200, 400)
SHARES = (0.0, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5)


def cell(human, neg, pos, truth, n_gold, share, rng):
    hit = width = bias = skipped = rec = 0
    for _ in range(REPS):
        gn, gp = qr.draw(n_gold, share, neg, pos, rng)
        if share > 0 and (len(gn) < 2 or len(gp) < 2):
            skipped += 1
            continue
        est, se = qa.stratified(human, neg, pos, gn, gp, assume_zero_negatives=share == 0)
        hit += q.covers((est, se), truth)
        width += 2 * q.Z95 * se
        bias += est - truth
        if share > 0:
            rec += qr.recall(human, neg, pos, gn, gp)
    m = REPS - skipped
    return hit / m, width / m, bias / m, (rec / m if share > 0 else float("nan")), skipped


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
           "design: an audit of n items with neg_share of them drawn from coder-negative items (0 = all among "
           "coder-positives, negatives assumed to hold no positives); estimate = stratum shares x audited mean human code.", ""]
    out.append("1. Coders on the evaluated items")
    out.append("coder coded_positive precision recall miss_rate(share of corpus, human=1 but coder=0) neyman_neg_share")
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
    out.append("5. Mean interval width over the four coders, by negative share (columns) and audit size (rows)")
    out.append("n_gold " + " ".join(f"neg{s}" for s in SHARES))
    for n in SIZES:
        out.append(f"{n} " + " ".join(f"{statistics.fmean(res[nm, n, s][1] for nm, _ in coders):.4f}" for s in SHARES))
    out.append("")
    out.append("6. Worst coverage over the four coders")
    out.append("n_gold " + " ".join(f"neg{s}" for s in SHARES))
    for n in SIZES:
        out.append(f"{n} " + " ".join(f"{min(res[nm, n, s][0] for nm, _ in coders):.3f}" for s in SHARES))
    out.append("")
    out.append("7. Mean estimated recall of the coder (true recall in section 1), mean over draws, by coder")
    out.append("coder n_gold " + " ".join(f"neg{s}" for s in SHARES[1:]))
    for name, _ in coders:
        for n in SIZES:
            out.append(f"{name.replace(' ', '_')} {n} " + " ".join(f"{res[name, n, s][3]:.3f}" for s in SHARES[1:]))
    out.append("")
    out.append("8. Draws dropped for under 2 audited items in a stratum (all coders, all sizes, of "
               f"{REPS * len(coders) * len(SIZES)} per share)")
    out.append("share dropped " + " ".join(f"{s}:{sum(res[nm, n, s][4] for nm, _ in coders for n in SIZES)}" for s in SHARES))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
