"""How big must a hand-coded audit be before 'audit, then trust the coder if it passes' keeps a 95% interval
honest? Equivalence (TOST) gates at several tolerances, against always-PPI, on GoEmotions with coders of known
prevalence bias. Uses qual-real's cached download (not committed). Writes experiments/results.txt.

    python3 experiments/run.py      # about 2 minutes, stdlib only, seeded
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import qualequiv as e  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)

g, q = e.g, e.q
r = g.r
REPS, SEED = 500, 20261022
RATIOS = (0.6, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5)
SIZES = (100, 200, 400, 800, 1600)
DELTAS = (0.005, 0.01, 0.02, 0.05)


def cell(llm, human, truth, n_gold, rng):
    """Coverage and correction rate of every estimator over REPS random hand-coded draws."""
    n = len(human)
    names = ["ppi", "z"] + [f"tost{d}" for d in DELTAS] + ["split"]
    hit = {k: 0 for k in names}
    used = {k: 0 for k in names}
    for _ in range(REPS):
        gold = rng.sample(range(n), n_gold)
        lg, hg = [llm[i] for i in gold], [human[i] for i in gold]
        est = {"ppi": (*q.ppi(llm, lg, hg), True)}
        est["z"] = g.gated(llm, lg, hg)
        for d in DELTAS:
            est[f"tost{d}"] = e.gated_equiv(llm, lg, hg, d)
        est["split"] = e.split_gated(llm, lg, hg)
        for k, (m, s, u) in est.items():
            hit[k] += q.covers((m, s), truth)
            used[k] += u
    return {k: (hit[k] / REPS, used[k] / REPS) for k in names}, names


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
    truth = statistics.fmean(human)
    coders = [(f"nb x{ratio}", g.threshold_coder(scores, human, ratio)) for ratio in RATIOS]
    coders.append(("lexicon", [r.lexicon_code(x[1]) for x in test]))
    out = [f"GoEmotions (first file): {len(ex)} examples; {len(train)} train naive-Bayes, {len(test)} evaluated. "
           f"{REPS} hand-coded draws per cell, seed {SEED}.",
           f"estimand: human negative-emotion prevalence over the {len(test)} evaluated items = {truth:.4f}",
           "gates: z = qual-gate's difference test (|z|>1.96 -> correct); tostD = naive only if the 90% interval of mean(human-coder) "
           "is inside +-D, else PPI; split = z test on the first half of the sample, PPI on the second half alone.", ""]
    out.append("E1. Coders, and the standard error that decides how big an audit must be")
    out.append("coder bias err_rate sd_diff naive_halfwidth")
    sd = {}
    for name, llm in coders:
        d = e.diffs(llm, human)
        sd[name] = statistics.pstdev(d)
        bias = statistics.fmean(llm) - truth
        out.append(f"{name.replace(' ', '_')} {bias:+.4f} {sum(abs(x) for x in d) / len(d):.3f} {sd[name]:.3f} "
                   f"{q.Z95 * q.naive(llm)[1]:.4f}")
    out.append("")
    results = {}
    for name, llm in coders:
        for n_gold in SIZES:
            results[name, n_gold], names = cell(llm, human, truth, n_gold, rng)
    out.append("E2. Coverage of the 95% interval by coder, audit size and gate")
    out.append("coder n_gold " + " ".join(names))
    for name, _ in coders:
        for n_gold in SIZES:
            c = results[name, n_gold]
            out.append(f"{name.replace(' ', '_')} {n_gold} " + " ".join(f"{c[k][0]:.3f}" for k in names))
    out.append("")
    out.append("E3. Share of draws where the gate corrects (1 - this = share that trusts the coder)")
    out.append("coder n_gold " + " ".join(names))
    for name, _ in coders:
        for n_gold in SIZES:
            c = results[name, n_gold]
            out.append(f"{name.replace(' ', '_')} {n_gold} " + " ".join(f"{c[k][1]:.3f}" for k in names))
    out.append("")
    out.append("E4. Worst coverage over the eight coders, by audit size (the audit protects only if this stays near 0.95)")
    out.append("n_gold " + " ".join(names))
    for n_gold in SIZES:
        out.append(f"{n_gold} " + " ".join(f"{min(results[nm, n_gold][k][0] for nm, _ in coders):.3f}" for k in names))
    out.append("")
    out.append("E5. Audit size at which a TOST has about 50% power to pass an exactly unbiased coder, n = (1.645 sd / delta)^2, "
               f"with sd = {sd['nb x1.0']:.3f} (the nb x1.0 coder); compare 3,188 items in the whole corpus")
    out.append("delta n_needed")
    for d in DELTAS:
        out.append(f"{d} {e.tost_audit_size(sd['nb x1.0'], d):.0f}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
