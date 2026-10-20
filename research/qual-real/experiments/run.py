"""Naive, human-only and PPI estimates of a code's prevalence and of a group gap, on GoEmotions with real
human labels as truth. Downloads the CSV on first use (not committed). Writes experiments/results.txt.

    python3 experiments/run.py      # about 1-2 minutes, stdlib only, seeded
"""
import random
import statistics
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import qualreal as r  # noqa: E402
q = r.q

URL = "https://storage.googleapis.com/gresearch/goemotions/data/full_dataset/goemotions_1.csv"
CACHE = Path.home() / ".cache" / "qual-real" / "goemotions_1.csv"
REPS, SIZES, SEED = 500, (100, 200, 400), 20261020


def fetch():
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(URL, CACHE)
    return CACHE


def main():
    ex = r.load_examples(fetch())
    rng = random.Random(SEED)
    order = list(range(len(ex)))
    rng.shuffle(order)
    cut = int(0.4 * len(ex))
    train, test = [ex[i] for i in order[:cut]], [ex[i] for i in order[cut:]]
    nb = r.NaiveBayes().fit([e[1] for e in train], [e[2] for e in train])
    # fix the threshold so the coder's overall positive rate matches the training share (a coder tuned on a
    # codebook-dev slice); no test label is used.
    scores = sorted(nb.score(e[1]) for e in train)
    share = sum(e[2] for e in train) / len(train)
    nb.bias = scores[int((1 - share) * len(scores))]
    human = [e[2] for e in test]
    grp = [r.group_of(e[3]) for e in test]
    coders = {"naive-bayes": [nb.code(e[1]) for e in test], "lexicon": [r.lexicon_code(e[1]) for e in test]}
    n = len(test)
    sets = {"all": set(range(n)), "short": {i for i in range(n) if grp[i] == "short"},
            "long": {i for i in range(n) if grp[i] == "long"}}
    truth = {k: statistics.fmean(human[i] for i in s) for k, s in sets.items()}
    truth_gap = truth["short"] - truth["long"]
    out = [f"GoEmotions (first file): {len(ex)} examples with >=3 raters; {len(train)} to train the coder, {n} evaluated.",
           "code = majority of raters marked a negative emotion; group = comment length (short <=10 words).",
           f"human prevalence on the evaluated items: all {truth['all']:.4f}, short {truth['short']:.4f} "
           f"(n={len(sets['short'])}), long {truth['long']:.4f} (n={len(sets['long'])}); gap short-long {truth_gap:+.4f}", ""]
    out.append("E1. The coders against human labels (all evaluated items)")
    out.append("coder  sens  spec  acc  kappa  sens_short  spec_short  sens_long  spec_long")
    for name, llm in coders.items():
        c = r.confusion(llm, human)
        cs = r.confusion([llm[i] for i in sets["short"]], [human[i] for i in sets["short"]])
        cl = r.confusion([llm[i] for i in sets["long"]], [human[i] for i in sets["long"]])
        out.append(f"{name} {c['sens']:.3f} {c['spec']:.3f} {c['acc']:.3f} {q.cohen_kappa(llm, human):.3f} "
                   f"{cs['sens']:.3f} {cs['spec']:.3f} {cl['sens']:.3f} {cl['spec']:.3f}")
    out.append("")
    for name, llm in coders.items():
        for ng in SIZES:
            acc = {k: {m: [] for m in ("naive", "human", "ppi")} for k in ("all", "gap")}
            for _ in range(REPS):
                gold = rng.sample(range(n), ng)
                est = {k: r.estimates(llm, human, gold, s) for k, s in sets.items()}
                for m, e in est["all"].items():
                    acc["all"][m].append((e, truth["all"]))
                for m in ("naive", "human", "ppi"):
                    if m in est["short"] and m in est["long"]:
                        acc["gap"][m].append((q.gap(est["short"][m], est["long"][m]), truth_gap))
            out.append(f"E2. {name}, {ng} hand-coded items, {REPS} draws")
            out.append("target  estimator  true  mean_est  bias  coverage  width  draws")
            for k, label in (("all", "prevalence"), ("gap", "gap(short-long)")):
                for m in ("naive", "human", "ppi"):
                    rows = acc[k][m]
                    if not rows:
                        continue
                    ests = [e[0] for e, _ in rows]
                    t = rows[0][1]
                    cov = statistics.fmean(q.covers(e, t) for e, _ in rows)
                    w = statistics.fmean(2 * q.Z95 * e[1] for e, _ in rows)
                    out.append(f"{label} {m} {t:.4f} {statistics.fmean(ests):.4f} {statistics.fmean(ests) - t:+.4f} "
                               f"{cov:.3f} {w:.4f} {len(rows)}")
            out.append("")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
