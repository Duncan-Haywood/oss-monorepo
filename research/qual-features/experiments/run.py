"""AUC of four feature sets against the number of labelled items, on GoEmotions. Writes results.txt.

    python3 experiments/run.py      # several minutes, stdlib only, seeded (run in the background)
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import qualfeatures as f  # noqa: E402
sys.path.insert(0, str(HERE.parents[1] / "qual-real" / "experiments"))
import run as qrun  # noqa: E402  (fetch(): the cached download)
r = f.r

SEED, REPS, SIZES, TEST = 20261021, 12, (25, 50, 100, 200, 400, 800, 1600), 1500
KINDS = ("bow", "embed", "codes", "bow+codes")


def main():
    ex = r.load_examples(qrun.fetch())
    rng = random.Random(SEED)
    rng.shuffle(ex)
    test, pool = ex[:TEST], ex[TEST:]
    texts_all = [e[1] for e in ex]  # unlabelled text only: vocabulary and standardisation use no label
    vocab = f.build_vocab(texts_all)
    feats = {k: f.Featurizer(k, vocab, texts_all) for k in KINDS}
    xt = {k: [feats[k](e[1]) for e in test] for k in KINDS}
    yt = [e[2] for e in test]
    xp = {k: [feats[k](e[1]) for e in pool] for k in KINDS}
    yp = [e[2] for e in pool]
    out = [f"GoEmotions (first file): {len(ex)} examples; {len(test)} held out for AUC, {len(pool)} in the labelling pool; "
           f"vocabulary {len(vocab)} words (df>=3); negative share {sum(yt)/len(yt):.3f} in the held-out set.",
           f"{REPS} random labelled subsets per size; mean AUC (sd over subsets) on the same held-out items. L2 strength (1, 10 or 100) chosen per fit on a 25% validation slice of the labelled items.", "",
           "n_labelled " + " ".join(f"{k}_mean {k}_sd" for k in KINDS)]
    for n in SIZES:
        res = {k: [] for k in KINDS}
        for rep in range(REPS):
            sub = random.Random(SEED + 1000 * n + rep).sample(range(len(pool)), n)
            for k in KINDS:
                w, _ = f.fit_tuned([xp[k][i] for i in sub], [yp[i] for i in sub], seed=rep)
                res[k].append(f.auc([f.predict(w, x) for x in xt[k]], yt))
        out.append(f"{n} " + " ".join(f"{statistics.fmean(res[k]):.4f} {statistics.stdev(res[k]):.4f}" for k in KINDS))
        print(out[-1], flush=True)
    (HERE / "results.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
