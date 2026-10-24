"""With K groups, how do audit design and a multiplicity adjustment change the intervals for every group's prevalence?
Groups are comment-length bins on GoEmotions; truth is the human prevalence in each bin of the evaluated items.
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
sys.path.insert(0, str(HERE.parents[1] / "qual-gate"))
import qualmany as qm  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)
import qualgate as gate  # noqa: E402  (threshold_coder)

r = real.r
q = qm.q
REPS, SEED = 300, 20261023
RATIOS = (0.8, 1.0, 1.25)
SIZES = (120, 240, 480, 960, 1920)
DESIGNS = ("random", "equal")
ADJ = ("none", "bonferroni")
GROUPINGS = (("K=3", [7, 17]), ("K=6", [4, 7, 11, 17, 26]))


def cell(llm, human, members, truth, n, design, rng):
    """Per (adjust): mean per-group coverage, share of draws where all K cover, mean width; plus dropped draws."""
    k = len(members)
    tot = {a: [0.0, 0, 0.0] for a in ADJ}
    kept = 0
    for _ in range(REPS):
        est = qm.group_ppi(llm, human, members, qm.draw(design, n, members, rng))
        if est is None:
            continue
        kept += 1
        for a in ADJ:
            z = qm.z_for(k, a)
            hits = [abs(e - t) <= z * s for (e, s), t in zip(est, truth)]
            tot[a][0] += sum(hits) / k
            tot[a][1] += all(hits)
            tot[a][2] += statistics.fmean(2 * z * s for _, s in est)
    if not kept:
        return None
    return {a: (v[0] / kept, v[1] / kept, v[2] / kept) for a, v in tot.items()}, REPS - kept


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
    coders = [(f"nb x{ratio}", gate.threshold_coder(scores, human, ratio)) for ratio in RATIOS]
    coders.append(("lexicon", [r.lexicon_code(x[1]) for x in test]))
    words = [x[3] for x in test]
    out = [f"GoEmotions (first file): {len(ex)} examples; {len(train)} train naive-Bayes, {len(test)} evaluated. "
           f"{REPS} audit draws per cell, seed {SEED}.",
           "designs: random = one sample of the corpus; equal = n/K per group (a group smaller than its share gives the rest to the "
           "others). Every group's interval is prediction-powered from its own audited items. Draws with under 5 audited items in "
           "any group are dropped and counted. 'each' = mean over groups of coverage of that group's truth; 'all' = share of draws "
           "in which all K intervals cover at once; 'width' = mean 95% (or Bonferroni) interval width over groups.", ""]
    for gname, edges in GROUPINGS:
        g = qm.bin_groups(words, edges)
        members = [[i for i, x in enumerate(g) if x == j] for j in range(len(edges) + 1)]
        truth = [statistics.fmean(human[i] for i in m) for m in members]
        tag = gname.replace("=", "")
        out.append(f"=== {gname}: word-count bins with upper edges {edges} + the rest")
        out.append("sizes " + " ".join(str(len(m)) for m in members) + "  (smallest " + f"{min(len(m) for m in members) / len(test):.3f} of the corpus)")
        out.append("human prevalence " + " ".join(f"{t:.3f}" for t in truth))
        out.append("")
        res = {}
        for name, llm in coders:
            for n in SIZES:
                for d in DESIGNS:
                    res[name, n, d] = cell(llm, human, members, truth, n, d, rng)
        for a in ADJ:
            for tag2, idx, title in (("each", 0, "mean per-group coverage"), ("all", 1, "coverage of all K intervals at once"),
                                     ("width", 2, "mean interval width")):
                out.append(f"{tag}.{a}.{tag2} {title}, {a} adjustment; mean over the four coders, worst coder in the last two columns"
                           if idx < 2 else f"{tag}.{a}.{tag2} {title}, {a} adjustment; mean over the four coders")
                head = "n_gold " + " ".join(DESIGNS)
                out.append(head + (" " + " ".join(f"worst_{d}" for d in DESIGNS) if idx < 2 else ""))
                for n in SIZES:
                    row = [f"{n}"]
                    vals = {d: [res[nm, n, d][0][a][idx] for nm, _ in coders if res[nm, n, d]] for d in DESIGNS}
                    row += [f"{statistics.fmean(vals[d]):.3f}" if vals[d] else "na" for d in DESIGNS]
                    if idx < 2:
                        row += [f"{min(vals[d]):.3f}" if vals[d] else "na" for d in DESIGNS]
                    out.append(" ".join(row))
                out.append("")
        out.append(f"{tag}.dropped draws (under 5 audited items in a group), out of {REPS}, mean over coders")
        out.append("n_gold " + " ".join(DESIGNS))
        for n in SIZES:
            out.append(f"{n} " + " ".join(f"{statistics.fmean(res[nm, n, d][1] if res[nm, n, d] else REPS for nm, _ in coders):.0f}" for d in DESIGNS))
        out.append("")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
