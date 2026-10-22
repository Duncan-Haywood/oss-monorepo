"""Does stratifying the audit by group help a group gap? Short-vs-long comment gap in negative-emotion prevalence on
GoEmotions, audits drawn at random, with equal numbers per group, or with (oracle) Neyman allocation.
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
import qualstrat as qs  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)

qg = qs.qg
e, g, q = qg.e, qg.g, qg.q
r = g.r
REPS, SEED = 400, 20261022
RATIOS = (0.8, 1.0, 1.25)
SIZES = (100, 200, 400, 800, 1600)
DESIGNS = ("random", "equal", "neyman")


def cell(llm, human, a_all, b_all, truth, n_gold, design, share, rng):
    hit = width = trust = skipped = 0
    for _ in range(REPS):
        ga, gb = qs.draw(design, n_gold, a_all, b_all, rng, share)
        if len(ga) < 5 or len(gb) < 5:
            skipped += 1
            continue
        est, se = qg.ppi_gap(llm, human, a_all, b_all, ga, gb)
        hit += q.covers((est, se), truth)
        width += 2 * q.Z95 * se
        trust += not qg.gated_gap(llm, human, a_all, b_all, ga, gb, "gap")[2]
    m = REPS - skipped
    return hit / m, width / m, trust / m, skipped


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
    words = sorted(x[3] for x in test)
    cut90 = words[int(0.9 * len(words))]
    groupings = [("short (<=10 words) vs long", lambda x: x[3] <= 10),
                 (f"rare: longest (>={cut90} words) vs rest", lambda x: x[3] >= cut90)]
    out = [f"GoEmotions (first file): {len(ex)} examples; {len(train)} train naive-Bayes, {len(test)} evaluated. "
           f"{REPS} audit draws per cell, seed {SEED}.",
           "designs: random = one sample of the corpus; equal = n/2 per group; neyman = audit share for group A proportional "
           "to the sd of (human - coder) in it, the share that minimises the rectifier variance (oracle, full data). All use "
           "the group-wise prediction-powered gap. 'trusts' = share of draws where the z test on the gap bias passes.", ""]
    for gi, (gname, in_a) in enumerate(groupings, 1):
        a_all = [i for i, x in enumerate(test) if in_a(x)]
        a_set = set(a_all)
        b_all = [i for i in range(len(test)) if i not in a_set]
        prev = lambda idx: statistics.fmean(human[i] for i in idx)  # noqa: E731
        truth = prev(a_all) - prev(b_all)
        out.append(f"=== Grouping G{gi}: {gname}: {len(a_all)} in A ({len(a_all) / len(test):.3f} of the corpus), {len(b_all)} in B")
        out.append(f"estimand: human prevalence A - B = {prev(a_all):.4f} - {prev(b_all):.4f} = {truth:+.4f}")
        out.append("")
        out.append(f"G{gi}.1 Optimal audit share for group A, by coder")
        shares = {}
        for name, llm in coders:
            shares[name] = qs.allocation(llm, human, a_all, b_all)
            out.append(f"{name.replace(' ', '_')} {shares[name]:.3f}")
        out.append("")
        res = {}
        for name, llm in coders:
            for n in SIZES:
                for d in DESIGNS:
                    res[name, n, d] = cell(llm, human, a_all, b_all, truth, n, d, shares[name], rng)
                    if res[name, n, d][3]:
                        out.append(f"note: {name} n={n} {d}: {res[name, n, d][3]} of {REPS} draws had under 5 audited items in a group, dropped")
        for tag, idx, title in (("2", 0, "Coverage of the 95% interval (group-wise PPI)"),
                                ("3", 1, "Mean width of the 95% interval"),
                                ("4", 2, "Share of draws where the gap-bias z test trusts the coder (power = 1 - this)")):
            out.append(f"G{gi}.{tag} {title}")
            out.append("coder n_gold " + " ".join(DESIGNS))
            for name, _ in coders:
                for n in SIZES:
                    out.append(f"{name.replace(' ', '_')} {n} " + " ".join(f"{res[name, n, d][idx]:.3f}" for d in DESIGNS))
            out.append("")
        out.append(f"G{gi}.5 Mean interval width over the four coders, by audit size")
        out.append("n_gold " + " ".join(DESIGNS))
        for n in SIZES:
            out.append(f"{n} " + " ".join(f"{statistics.fmean(res[nm, n, d][1] for nm, _ in coders):.4f}" for d in DESIGNS))
        out.append("")
        out.append(f"G{gi}.6 Worst coverage over the four coders, by audit size")
        out.append("n_gold " + " ".join(DESIGNS))
        for n in SIZES:
            out.append(f"{n} " + " ".join(f"{min(res[nm, n, d][0] for nm, _ in coders):.3f}" for d in DESIGNS))
        out.append("")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
