"""Do LLM-style qualitative codes beat bag-of-words as features, at the same number of labelled outcomes?
Uses the 28 GoEmotions codes (human majority vote, the ceiling for an LLM coder) and simulated coder error.
Downloads the CSV on first use (shared cache with qual-real, not committed). Writes experiments/results.txt.

    python3 experiments/run.py      # a few minutes, seeded; needs numpy, scipy, scikit-learn
"""
import csv
import warnings
import random
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import qualfeaturesout as q  # noqa: E402
import run as real  # noqa: E402  (qual-real's downloader)

SEED, TEST_N, REPS = 20261021, 3000, 30
SIZES = (50, 100, 200, 400, 800, 1600)
# Subreddits where people mostly talk about themselves; listed before any result was seen.
DISCLOSURE = {"socialanxiety", "confession", "exmormon", "LGBTeens", "2meirl4meirl", "OkCupid", "datingoverthirty",
              "gaybros", "TalesFromYourServer"}
COMBOS = {"numeric": ["num"], "codes": ["codes"], "codes+numeric": ["codes", "num"], "bow": ["bow"],
          "bow+numeric": ["bow", "num"], "lsa+numeric": ["lsa", "num"], "all": ["codes", "bow", "num"]}


def load(path):
    """Collapse rater rows to items: text, 28 majority-vote codes, and whether the comment replies to a comment."""
    cols = None
    votes, meta, unclear = defaultdict(list), {}, set()
    with open(path, newline="", encoding="utf-8") as f:
        rd = csv.DictReader(f)
        cols = rd.fieldnames[9:]
        for row in rd:
            i = row["id"]
            meta[i] = (row["text"], row["parent_id"].startswith("t1_"), row["subreddit"] in DISCLOSURE)
            votes[i].append([int(row[c]) for c in cols])
            if row["example_very_unclear"] == "True":
                unclear.add(i)
    items = []
    for i in sorted(votes):
        v = votes[i]
        if len(v) >= 3 and i not in unclear:
            codes = [int(sum(r[k] for r in v) * 2 > len(v)) for k in range(len(cols))]
            items.append((i, meta[i][0], codes, int(meta[i][1]), int(meta[i][2])))
    return items, cols


def block_table(title, res, combos):
    lines = [title, "n     " + "  ".join(f"{c:>13}" for c in combos)]
    for n in SIZES:
        lines.append(f"{n:<5} " + "  ".join(f"{res[(c, n)][0]:13.3f}" for c in combos))
    lines.append("sd    " + "  ".join(f"{res[(c, SIZES[-1])][1]:13.3f}" for c in combos) + "   (sd of AUC at the largest n)")
    return lines


def main():
    items, cols = load(real.fetch())
    rng = random.Random(SEED)
    order = list(range(len(items)))
    rng.shuffle(order)
    items = [items[i] for i in order]
    test_idx, pool_idx = np.arange(TEST_N), np.arange(TEST_N, len(items))
    texts = [e[1] for e in items]
    tf = TfidfVectorizer(min_df=3, sublinear_tf=True)
    bow = tf.fit_transform(texts)  # unsupervised: fit on all text, no outcome label seen
    lsa = TruncatedSVD(100, random_state=SEED).fit_transform(bow)
    num = np.array([q.numeric_features(t) for t in texts])
    codes = np.array([e[2] for e in items], dtype=float)
    blocks = {"num": num, "codes": codes, "bow": bow, "lsa": lsa}
    out = [f"qual-features-outcomes: {len(items)} GoEmotions items ({len(pool_idx)} pool, {TEST_N} fixed test), {REPS} draws per cell, "
           f"seed {SEED}", "metric: test AUC of an L2 logistic regression, C chosen by 3-fold CV on the labelled draw",
           f"codes: {len(cols)} human-majority emotion codes (the ceiling for a coder); bow: tf-idf unigrams, {bow.shape[1]} terms; "
           "lsa: 100-dim SVD of the tf-idf (an embedding stand-in, not a neural embedding)", ""]
    reply = np.array([e[3] for e in items])
    out += block_table(f"== A. outcome: comment replies to another comment (prevalence {reply.mean():.3f})",
                       q.sweep(blocks, reply, test_idx, pool_idx, SIZES, REPS, SEED, COMBOS), COMBOS) + [""]
    disc = np.array([e[4] for e in items])
    out += block_table(f"== D. outcome: comment is from one of 9 self-disclosure subreddits (prevalence {disc.mean():.3f})",
                       q.sweep(blocks, disc, test_idx, pool_idx, SIZES, REPS, SEED, COMBOS), COMBOS) + [""]
    null = np.array([q.null_outcome(e[0]) for e in items])
    out += block_table(f"== B. null outcome: a coin flip by item id (prevalence {null.mean():.3f}); expect 0.5",
                       q.sweep(blocks, null, test_idx, pool_idx, SIZES, REPS, SEED, COMBOS), COMBOS) + [""]
    # C. simulated coder error on the codes, outcome A
    noisy = {}
    for rate in (0.0, 0.02, 0.05, 0.1, 0.2):
        nb = dict(blocks)
        nb["codes"] = np.array(q.flip_codes(codes.astype(int).tolist(), rate, random.Random(f"{SEED}/{rate}")), dtype=float)
        res = q.sweep(nb, reply, test_idx, pool_idx, (400,), REPS, SEED, {"codes+numeric": ["codes", "num"]})
        noisy[rate] = res[("codes+numeric", 400)]
    bow_ref = q.sweep(blocks, reply, test_idx, pool_idx, (400,), REPS, SEED, {"bow+numeric": ["bow", "num"]})[("bow+numeric", 400)]
    out += ["== C. coder error: codes+numeric AUC at n=400 when each code cell flips with probability e (simulated)",
            "e      auc    sd", *[f"{r:<6} {v[0]:.3f}  {v[1]:.3f}" for r, v in noisy.items()],
            f"bow+numeric reference at n=400: {bow_ref[0]:.3f}"]
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
