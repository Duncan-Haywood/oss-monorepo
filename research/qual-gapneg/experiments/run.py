"""Which interval covers a short-minus-long group gap when only 5-50 of the coder's negatives are hand-coded?
Same corpus, split, coders and audit size as qual-negint (GoEmotions; naive-Bayes at three cut-offs and a word
list); the estimand is the gap in human negative-emotion prevalence between short (<= 10 words) and long comments.
The audit puts k items on coder-negatives and 200-k on coder-positives (or is a plain random 200), both drawn over
the whole corpus, so how many land in each group's cell is itself random. Intervals: wald, plus_two, jeffreys,
pooled (qualgapneg.py). Uses qual-real's cached download. Writes experiments/results.txt.

    python3 experiments/run.py      # a few minutes, stdlib only, seeded; start it in the background
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "qual-negaudit"))
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import qualgapneg as gn  # noqa: E402
import qualneg as qn  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)

qa = qn.qa
g, r = qa.qg.g, qa.qg.g.r
REPS, SEED, N_GOLD = 500, 20261023, 200
RATIOS = (0.8, 1.0, 1.25)
DESIGNS = (5, 10, 20, 50, "random")
METHODS = ("wald", "plus_two", "jeffreys", "pooled")


def interval(m, cells, rng):
    return getattr(gn, m)(cells, rng) if m in ("jeffreys", "pooled") else getattr(gn, m)(cells)


def cell(human, group, neg, pos, truth, design, rng):
    n = len(human)
    hit = dict.fromkeys(METHODS, 0)
    width = dict.fromkeys(METHODS, 0.0)
    point = dict.fromkeys(METHODS, 0.0)
    empty = tiny = 0
    for _ in range(REPS):
        if design == "random":
            sel = set(rng.sample(range(n), N_GOLD))
            an, ap = [i for i in neg if i in sel], [i for i in pos if i in sel]
        else:
            an, ap = rng.sample(neg, design), rng.sample(pos, N_GOLD - design)
        cells = gn.cells_from_audit(human, group, neg, pos, an, ap)
        negn = [cells[x, "neg"][2] for x in gn.GROUPS]
        empty += min(negn) == 0
        tiny += min(negn) < 3
        for m in METHODS:
            lo, hi, pt = interval(m, cells, rng)
            hit[m] += lo <= truth <= hi
            width[m] += hi - lo
            point[m] += pt - truth
    return {m: (hit[m] / REPS, width[m] / REPS, point[m] / REPS) for m in METHODS}, empty / REPS, tiny / REPS


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
    group = ["A" if r.group_of(x[3]) == "short" else "B" for x in test]
    coders = [(f"nb x{ratio}", g.threshold_coder(scores, human, ratio)) for ratio in RATIOS]
    coders.append(("lexicon", [r.lexicon_code(x[1]) for x in test]))
    truth = gn.true_gap(human, group)
    out = [f"GoEmotions (first file): {len(ex)} examples; {len(train)} train naive-Bayes, {len(test)} evaluated "
           f"({group.count('A')} short, {group.count('B')} long). {REPS} audit draws per cell, audit size {N_GOLD}, seed {SEED}. "
           f"Estimand: human negative-emotion prevalence, short minus long = {truth:.4f}.",
           "Intervals are nominal 95%. wald: cell p = x/n, an empty cell adds nothing; plus_two: +1 success +1 failure per cell; "
           "jeffreys: Beta(x+.5, n-x+.5) per cell, 400 posterior draws; pooled: jeffreys with one shared posterior for the "
           "negative stratum of both groups. Designs: k = coder-negatives audited of 200, or 'random' = 200 random items.", ""]
    res, miss = {}, {}
    for name, llm in coders:
        neg, pos = qa.strata(llm)
        gaps = {gr: statistics.fmean(h for h, gg, c in zip(human, group, llm) if gg == gr and not c) for gr in gn.GROUPS}
        miss[name] = gaps
        for d in DESIGNS:
            res[name, d] = cell(human, group, neg, pos, truth, d, rng)
    out.append("0. Positive rate among the coder's negatives, by group (the miss rate the audit must estimate)")
    out.append("coder short long")
    for name, _ in coders:
        out.append(f"{name.replace(' ', '_')} {miss[name]['A']:.3f} {miss[name]['B']:.3f}")
    out.append("")
    for tag, idx, title in (("1", 0, "Coverage"), ("2", 1, "Mean width"), ("3", 2, "Mean (estimate - truth)")):
        out.append(f"{tag}. {title} by coder and design")
        out.append("coder design " + " ".join(METHODS))
        for name, _ in coders:
            for d in DESIGNS:
                out.append(f"{name.replace(' ', '_')} {d} " + " ".join(f"{res[name, d][0][m][idx]:.3f}" for m in METHODS))
        out.append("")
    out.append("4. Share of draws with an empty (0 items) / thin (<3 items) negative cell in either group")
    out.append("coder design empty thin")
    for name, _ in coders:
        for d in DESIGNS:
            out.append(f"{name.replace(' ', '_')} {d} {res[name, d][1]:.3f} {res[name, d][2]:.3f}")
    out.append("")
    out.append("5. Worst coverage over the four coders, by design")
    out.append("design " + " ".join(METHODS))
    for d in DESIGNS:
        out.append(f"{d} " + " ".join(f"{min(res[nm, d][0][m][0] for nm, _ in coders):.3f}" for m in METHODS))
    out.append("")
    out.append("6. Mean width over the four coders, by design")
    out.append("design " + " ".join(METHODS))
    for d in DESIGNS:
        out.append(f"{d} " + " ".join(f"{statistics.fmean(res[nm, d][0][m][1] for nm, _ in coders):.3f}" for m in METHODS))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
