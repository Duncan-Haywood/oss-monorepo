"""When the coder errs more in the rare group, does the equal-split audit still match the optimal one? Rare group = the
longest 10% of GoEmotions comments (qual-stratified's G2). Extra coder errors are injected in the rare group only: each
coder label there is flipped with probability FLIP (0 = the coder as-is). Designs: random, equal, neyman (oracle).
Uses qual-real's cached download (not committed). Writes experiments/results.txt.

    python3 experiments/run.py      # a few minutes, stdlib only, seeded
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "qual-stratified"))
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import qualstrat as qs  # noqa: E402
import run as real  # noqa: E402

qg = qs.qg
g, q = qg.g, qg.q
r = g.r
REPS, SEED = 400, 20261023
FLIPS = (0.0, 0.1, 0.2, 0.3)
SIZES = (100, 200, 400, 800)
DESIGNS = ("random", "equal", "neyman")


def inject(llm, a_all, flip, rng):
    out = list(llm)
    for i in a_all:
        if rng.random() < flip:
            out[i] = 1 - out[i]
    return out


def cell(llm, human, a_all, b_all, truth, n_gold, design, share, rng):
    hit = width = 0
    done = 0
    for _ in range(REPS):
        ga, gb = qs.draw(design, n_gold, a_all, b_all, rng, share)
        if len(ga) < 5 or len(gb) < 5:
            continue
        est, se = qg.ppi_gap(llm, human, a_all, b_all, ga, gb)
        hit += q.covers((est, se), truth)
        width += 2 * q.Z95 * se
        done += 1
    return hit / done, width / done


def err(llm, human, idx):
    return statistics.fmean(llm[i] != human[i] for i in idx)


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
    base = [("nb x1.0", g.threshold_coder(scores, human, 1.0)), ("nb x1.25", g.threshold_coder(scores, human, 1.25))]
    words = sorted(x[3] for x in test)
    cut90 = words[int(0.9 * len(words))]
    a_all = [i for i, x in enumerate(test) if x[3] >= cut90]
    a_set = set(a_all)
    b_all = [i for i in range(len(test)) if i not in a_set]
    prev = lambda idx: statistics.fmean(human[i] for i in idx)  # noqa: E731
    truth = prev(a_all) - prev(b_all)
    out = [f"GoEmotions (first file): {len(ex)} examples; {len(test)} evaluated; rare group A = longest (>={cut90} words): "
           f"{len(a_all)} items ({len(a_all) / len(test):.3f}). {REPS} audit draws per cell, seed {SEED}.",
           f"estimand: human prevalence A - B = {prev(a_all):.4f} - {prev(b_all):.4f} = {truth:+.4f}",
           "Extra errors: each coder label in A flipped with probability FLIP (injected, B untouched).", ""]
    res, shares, errs = {}, {}, {}
    for name, coder in base:
        for flip in FLIPS:
            llm = inject(coder, a_all, flip, random.Random(SEED + int(flip * 100)))
            key = (name, flip)
            shares[key] = qs.allocation(llm, human, a_all, b_all)
            errs[key] = (err(llm, human, a_all), err(llm, human, b_all))
            for n in SIZES:
                for d in DESIGNS:
                    res[key, n, d] = cell(llm, human, a_all, b_all, truth, n, d, shares[key], rng)
    out.append("R1 Coder error rate in A and in B, and oracle audit share for A")
    out.append("coder flip err_A err_B share_A")
    for name, _ in base:
        for flip in FLIPS:
            k = (name, flip)
            out.append(f"{name.replace(' ', '_')} {flip:.1f} {errs[k][0]:.3f} {errs[k][1]:.3f} {shares[k]:.3f}")
    out.append("")
    for tag, idx, title in (("2", 1, "Mean width of the 95% interval"), ("3", 0, "Coverage of the 95% interval")):
        out.append(f"R{tag} {title}")
        out.append("coder flip n_gold " + " ".join(DESIGNS))
        for name, _ in base:
            for flip in FLIPS:
                for n in SIZES:
                    out.append(f"{name.replace(' ', '_')} {flip:.1f} {n} " + " ".join(
                        f"{res[(name, flip), n, d][idx]:.3f}" for d in DESIGNS))
        out.append("")
    out.append("R4 Width ratio random / equal, and equal / neyman, mean over both coders, n_gold=200, by flip")
    out.append("flip random_over_equal equal_over_neyman")
    for flip in FLIPS:
        w = {d: statistics.fmean(res[(nm, flip), 200, d][1] for nm, _ in base) for d in DESIGNS}
        out.append(f"{flip:.1f} {w['random'] / w['equal']:.3f} {w['equal'] / w['neyman']:.3f}")
    out.append("")
    out.append("R5 Mean width over both coders, n_gold=200, by flip")
    out.append("flip " + " ".join(DESIGNS))
    for flip in FLIPS:
        out.append(f"{flip:.1f} " + " ".join(
            f"{statistics.fmean(res[(nm, flip), 200, d][1] for nm, _ in base):.4f}" for d in DESIGNS))
    out.append("")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
