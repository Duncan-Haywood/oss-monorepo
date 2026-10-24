"""Does an audit gate protect a group gap? Short-vs-long comment gap in negative-emotion prevalence on GoEmotions,
coders of known bias, gates on the overall bias, on the gap bias, and an equivalence test on the gap bias.
Uses qual-real's cached download (not committed). Writes experiments/results.txt.

    python3 experiments/run.py      # a few minutes, stdlib only, seeded
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import qualgap as qg  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)

e, g, q = qg.e, qg.g, qg.q
r = g.r
REPS, SEED = 500, 20261022
RATIOS = (0.6, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5)
SIZES = (100, 200, 400, 800, 1600)
RULES = [("ppi", None, None), ("overall", "overall", None), ("gap", "gap", None),
         ("tost0.02", "tost", 0.02), ("tost0.05", "tost", 0.05)]


def cell(llm, human, a_set, a_all, b_all, truth, n_gold, rng):
    n = len(human)
    hit = {k: 0 for k, _, _ in RULES}
    used = {k: 0 for k, _, _ in RULES}
    skipped = 0
    for _ in range(REPS):
        ga, gb = qg.split(rng.sample(range(n), n_gold), a_set)
        if len(ga) < 5 or len(gb) < 5:
            skipped += 1
            continue
        for k, rule, delta in RULES:
            if rule is None:
                est = (*qg.ppi_gap(llm, human, a_all, b_all, ga, gb), True)
            else:
                est = qg.gated_gap(llm, human, a_all, b_all, ga, gb, rule, delta)
            hit[k] += q.covers(est[:2], truth)
            used[k] += est[2]
    m = REPS - skipped
    return {k: (hit[k] / m, used[k] / m) for k, _, _ in RULES}, skipped


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
    a_set = {i for i, x in enumerate(test) if r.group_of(x[3]) == "short"}
    a_all = sorted(a_set)
    b_all = [i for i in range(len(test)) if i not in a_set]
    prev = lambda idx: statistics.fmean(human[i] for i in idx)  # noqa: E731
    truth = prev(a_all) - prev(b_all)
    coders = [(f"nb x{ratio}", g.threshold_coder(scores, human, ratio)) for ratio in RATIOS]
    coders.append(("lexicon", [r.lexicon_code(x[1]) for x in test]))
    out = [f"GoEmotions (first file): {len(ex)} examples; {len(train)} train naive-Bayes, {len(test)} evaluated "
           f"({len(a_all)} short <=10 words, {len(b_all)} long). {REPS} audit draws per cell, seed {SEED}.",
           f"estimand: human prevalence short - long over the evaluated items = {prev(a_all):.4f} - {prev(b_all):.4f} = {truth:+.4f}",
           "rules: ppi = always correct; overall = qual-gate's z test on all audited items; gap = z test on the gap bias "
           "(mean(human-coder) in short minus long); tostD = naive only if the gap bias's 90% interval is inside +-D. "
           "Else the group-wise prediction-powered gap.", ""]
    out.append("E1. Coders: overall bias, gap bias (coder gap minus true gap), and the naive gap interval's half-width")
    out.append("coder overall_bias coder_gap gap_bias naive_halfwidth")
    for name, llm in coders:
        ng = qg.naive_gap(llm, a_all, b_all)
        out.append(f"{name.replace(' ', '_')} {statistics.fmean(llm) - statistics.fmean(human):+.4f} {ng[0]:+.4f} "
                   f"{ng[0] - truth:+.4f} {q.Z95 * ng[1]:.4f}")
    out.append("")
    results = {}
    for name, llm in coders:
        for n_gold in SIZES:
            results[name, n_gold], skipped = cell(llm, human, a_set, a_all, b_all, truth, n_gold, rng)
            if skipped:
                out.append(f"note: {name} n_gold={n_gold}: {skipped} of {REPS} draws had under 5 audited items in a group and were dropped")
    names = [k for k, _, _ in RULES]
    out.append("E2. Coverage of the 95% interval for the gap, by coder, audit size and rule")
    out.append("coder n_gold " + " ".join(names))
    for name, _ in coders:
        for n_gold in SIZES:
            out.append(f"{name.replace(' ', '_')} {n_gold} " + " ".join(f"{results[name, n_gold][k][0]:.3f}" for k in names))
    out.append("")
    out.append("E3. Share of draws where the rule corrects (1 - this = share that trusts the coder)")
    out.append("coder n_gold " + " ".join(names))
    for name, _ in coders:
        for n_gold in SIZES:
            out.append(f"{name.replace(' ', '_')} {n_gold} " + " ".join(f"{results[name, n_gold][k][1]:.3f}" for k in names))
    out.append("")
    out.append("E4. Worst coverage over the eight coders, by audit size")
    out.append("n_gold " + " ".join(names))
    for n_gold in SIZES:
        out.append(f"{n_gold} " + " ".join(f"{min(results[nm, n_gold][k][0] for nm, _ in coders):.3f}" for k in names))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
