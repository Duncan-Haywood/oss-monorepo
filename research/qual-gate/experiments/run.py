"""Does 'audit the coder, then trust it if it passes' keep its 95% interval honest on GoEmotions? Compares the
naive, human-only, always-PPI and audit-gated prevalence estimates as the coder's prevalence bias grows.
Uses the cached download of qual-real (not committed). Writes experiments/results.txt.

    python3 experiments/run.py      # about 1 minute, stdlib only, seeded
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import qualgate as g  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)

r, q = g.r, g.q
REPS, SEED = 1000, 20261021
RATIOS = (0.6, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5)
SIZES = (100, 200, 400)


def trial(llm, human, n_gold, rng):
    n = len(human)
    gold = rng.sample(range(n), n_gold)
    lg, hg = [llm[i] for i in gold], [human[i] for i in gold]
    est = {"naive": q.naive(llm), "human": q.human_only(hg), "ppi": q.ppi(llm, lg, hg)}
    e, s, used = g.gated(llm, lg, hg)
    est["gated"] = (e, s)
    return est, used


def summarise(llm, human, truth, n_gold, rng):
    rows = {k: [] for k in ("naive", "human", "ppi", "gated")}
    used = 0
    for _ in range(REPS):
        est, u = trial(llm, human, n_gold, rng)
        used += u
        for k in rows:
            rows[k].append(est[k])
    out = {k: (statistics.fmean(q.covers(e, truth) for e in v), statistics.fmean(2 * q.Z95 * e[1] for e in v))
           for k, v in rows.items()}
    return out, used / REPS


def main():
    ex = r.load_examples(real.fetch())
    rng = random.Random(SEED)
    order = list(range(len(ex)))
    rng.shuffle(order)
    cut = int(0.4 * len(ex))
    train, test = [ex[i] for i in order[:cut]], [ex[i] for i in order[cut:]]
    nb = r.NaiveBayes().fit([e[1] for e in train], [e[2] for e in train])
    scores = [nb.score(e[1]) for e in test]
    human = [e[2] for e in test]
    truth = statistics.fmean(human)
    out = [f"GoEmotions (first file): {len(ex)} examples; {len(train)} train naive-Bayes, {len(test)} evaluated. "
           f"{REPS} hand-coded draws per cell.",
           f"estimand: human negative-emotion prevalence over the {len(test)} evaluated items = {truth:.4f}",
           "coder: naive-Bayes ranking with the cut set so it codes 1 for ratio x the true share of items "
           "(same ranking, only the cut moves); lexicon = the fixed 38-word list.",
           "gate: |mean(human - coder) / se| on the hand-coded sample > 1.96 -> prediction-powered estimate, else the naive one.", ""]
    coders = [(f"nb x{ratio}", g.threshold_coder(scores, human, ratio)) for ratio in RATIOS]
    coders.append(("lexicon", [r.lexicon_code(e[1]) for e in test]))
    out.append("E1. Coder against the humans")
    out.append("coder coded_share bias sens spec")
    for name, llm in coders:
        c = r.confusion(llm, human)
        out.append(f"{name.replace(' ', '_')} {statistics.fmean(llm):.4f} {statistics.fmean(llm) - truth:+.4f} {c['sens']:.3f} {c['spec']:.3f}")
    out.append("")
    out.append("E2. Coverage of the 95% interval and gate behaviour, 200 hand-coded items")
    out.append("coder gate_corrects naive human ppi gated width_naive width_ppi width_gated")
    cov = {}
    for name, llm in coders:
        s, used = summarise(llm, human, truth, 200, rng)
        cov[name] = s
        out.append(f"{name.replace(' ', '_')} {used:.3f} {s['naive'][0]:.3f} {s['human'][0]:.3f} {s['ppi'][0]:.3f} {s['gated'][0]:.3f} "
                   f"{s['naive'][1]:.4f} {s['ppi'][1]:.4f} {s['gated'][1]:.4f}")
    out.append("")
    out.append("E3. Gated-interval coverage and the share of draws where the gate corrects, by hand-coded sample size")
    out.append("coder " + " ".join(f"cov_n={s} corr_n={s}" for s in SIZES))
    for name, llm in coders:
        cells = []
        for n_gold in SIZES:
            s, used = summarise(llm, human, truth, n_gold, rng)
            cells.append(f"{s['gated'][0]:.3f} {used:.3f}")
        out.append(name.replace(" ", "_") + " " + " ".join(cells))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
