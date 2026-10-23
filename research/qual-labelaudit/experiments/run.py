"""Does sampling the hand-coded audit by the coder's own label help a prevalence estimate? Negative-emotion
prevalence on GoEmotions, audits drawn at random, post-stratified, with equal numbers per coder label, with (oracle)
Neyman allocation, or among coder-positive items only. Uses qual-real's cached download (not committed).
Writes experiments/results.txt.

    python3 experiments/run.py      # about a minute, stdlib only, seeded
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import qualaudit as qa  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)

qg = qa.qg
g, q = qg.g, qa.q
r = g.r
REPS, SEED = 1000, 20261023
RATIOS = (0.8, 1.0, 1.25)
SIZES = (50, 100, 200, 400, 800)
DESIGNS = ("random", "poststrat", "equal", "neyman", "positives")


def cell(llm, human, neg, pos, truth, n_gold, design, share, rng):
    hit = width = bias = skipped = 0
    for _ in range(REPS):
        gn, gp = qa.draw(design, n_gold, neg, pos, rng, share)
        if design == "random":
            idx = gn + gp
            est, se = q.ppi(llm, [llm[i] for i in idx], [human[i] for i in idx])
        else:
            if (len(gn) < 2 or len(gp) < 2) and design != "positives":
                skipped += 1
                continue
            est, se = qa.stratified(human, neg, pos, gn, gp, assume_zero_negatives=design == "positives")
        hit += q.covers((est, se), truth)
        width += 2 * q.Z95 * se
        bias += est - truth
    m = REPS - skipped
    return hit / m, width / m, bias / m, skipped


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
           "designs: random = one sample of the corpus, qual-correction's prediction-powered mean; poststrat = the same "
           "sample, stratified estimator by coder label; equal = n/2 coder-positive and n/2 coder-negative; neyman = "
           "positive share proportional to stratum share x sd of the human code (oracle, full data); positives = all "
           "n among coder-positive items, coder-negative items assumed to hold no positives (biased by the miss rate).", ""]
    out.append("1. Coders on the evaluated items")
    out.append("coder coded_positive precision recall miss_rate(share of corpus, human=1 but coder=0) share_neyman")
    shares, res = {}, {}
    strata = {}
    for name, llm in coders:
        neg, pos = qa.strata(llm)
        strata[name] = (neg, pos)
        tp = sum(human[i] for i in pos)
        fn = sum(human[i] for i in neg)
        shares[name] = qa.allocation(human, neg, pos)
        out.append(f"{name.replace(' ', '_')} {len(pos) / len(llm):.3f} {tp / len(pos):.3f} {tp / (tp + fn):.3f} "
                   f"{fn / len(llm):.4f} {shares[name]:.3f}")
    out.append("")
    for name, llm in coders:
        neg, pos = strata[name]
        for n in SIZES:
            for d in DESIGNS:
                res[name, n, d] = cell(llm, human, neg, pos, truth, n, d, shares[name], rng)
                if res[name, n, d][3]:
                    out.append(f"note: {name} n={n} {d}: {res[name, n, d][3]} of {REPS} draws had under 2 audited items in a stratum, dropped")
    for tag, idx, title in (("2", 0, "Coverage of the nominal 95% interval"), ("3", 1, "Mean width of the interval"),
                            ("4", 2, "Mean estimate minus truth (bias)")):
        out.append(f"{tag}. {title}")
        out.append("coder n_gold " + " ".join(DESIGNS))
        for name, _ in coders:
            for n in SIZES:
                out.append(f"{name.replace(' ', '_')} {n} " + " ".join(
                    f"{res[name, n, d][idx]:+.4f}" if idx == 2 else f"{res[name, n, d][idx]:.3f}" for d in DESIGNS))
        out.append("")
    out.append("5. Mean interval width over the four coders, by audit size")
    out.append("n_gold " + " ".join(DESIGNS))
    for n in SIZES:
        out.append(f"{n} " + " ".join(f"{statistics.fmean(res[nm, n, d][1] for nm, _ in coders):.4f}" for d in DESIGNS))
    out.append("")
    out.append("6. Worst coverage over the four coders, by audit size")
    out.append("n_gold " + " ".join(DESIGNS))
    for n in SIZES:
        out.append(f"{n} " + " ".join(f"{min(res[nm, n, d][0] for nm, _ in coders):.3f}" for d in DESIGNS))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
