"""Prompt-free detectors on dialogue turns: one turn or the whole thread, human vs plain-prompt Qwen2.5-0.5B-Instruct.

Reads data/threads.jsonl.gz and data/imitations.jsonl. Five-fold cross-validation grouped by thread: no thread is in
both the training and the test side. Writes results.json and results.txt.
"""
import gzip, json, re
import numpy as np
from scipy.sparse import hstack, csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

SEED = 0
ASSISTANTISM = re.compile(r"(\*\*|^\s*\d+\.\s|^(sure|certainly|of course|here)\b|as an ai)", re.I | re.M)


def load():
    threads = {}
    for l in gzip.open("data/threads.jsonl.gz", "rt"):
        t = json.loads(l)
        threads[t["tree"]] = t["turns"]
    gen = {}
    for l in open("data/imitations.jsonl"):
        r = json.loads(l)
        gen[(r["tree"], r["turn"])] = r["text"]
    rows = []                                  # one row per (thread, turn, label)
    for tree, turns in threads.items():
        if (tree, 2) not in gen or (tree, 3) not in gen:
            continue
        for turn, idx in ((2, 2), (3, 4)):
            for label, text in ((0, turns[idx]), (1, gen[(tree, turn)])):
                if text.strip():
                    rows.append({"tree": tree, "turn": turn, "label": label, "text": text,
                                 "prev_a": turns[idx - 1], "prev_p": turns[idx - 2]})
    keep = {t for t in {r["tree"] for r in rows} if sum(r["tree"] == t for r in rows) == 4}
    return [r for r in rows if r["tree"] in keep]


def words(s):
    return set(re.findall(r"[a-z']+", s.lower()))


def context_features(r):
    w, a, p = words(r["text"]), words(r["prev_a"]), words(r["prev_p"])
    jac = lambda x, y: len(x & y) / max(1, len(x | y))
    t = r["text"]
    return [np.log1p(len(t)), np.log1p(len(t.split())), jac(w, a), jac(w, p), t.count("\n") / 5, t.count("?"),
            float(bool(ASSISTANTISM.search(t))), float(t.rstrip()[-1:] in ".!?")]


def fold_scores(rows, kind):
    y = np.array([r["label"] for r in rows])
    g = np.array([r["tree"] for r in rows])
    score = np.zeros(len(rows))
    for tr, te in GroupKFold(5).split(rows, y, g):
        if kind == "ngram":
            cv = TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 4), min_df=3, sublinear_tf=True, max_features=60000)
            wv = TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True, max_features=60000)
            texts = [r["text"] for r in rows]
            Xtr = hstack([cv.fit_transform([texts[i] for i in tr]), wv.fit_transform([texts[i] for i in tr])]).tocsr()
            Xte = hstack([cv.transform([texts[i] for i in te]), wv.transform([texts[i] for i in te])]).tocsr()
            clf = LogisticRegression(C=10, max_iter=2000)
        else:
            X = np.array([context_features(r) if kind == "context" else [context_features(r)[0]] for r in rows])
            mu, sd = X[tr].mean(0), X[tr].std(0) + 1e-9
            Xtr, Xte = (X[tr] - mu) / sd, (X[te] - mu) / sd
            clf = LogisticRegression(C=1.0, max_iter=2000)
        clf.fit(Xtr, y[tr])
        score[te] = clf.decision_function(Xte)
    return score


def metrics(rows, score, trees, rng, boot=300):
    """AUROC for turn 2, turn 3 and the two-turn thread (sum of scores); paired accuracy within a thread."""
    by = {}
    for r, s in zip(rows, score):
        by.setdefault(r["tree"], {})[(r["turn"], r["label"])] = s

    def stat(ts):
        out = {}
        for name, f in (("turn2", lambda d, l: d[(2, l)]), ("turn3", lambda d, l: d[(3, l)]),
                        ("thread", lambda d, l: d[(2, l)] + d[(3, l)])):
            h = [f(by[t], 0) for t in ts]
            m = [f(by[t], 1) for t in ts]
            y = [0] * len(h) + [1] * len(m)
            out[name + "_auroc"] = roc_auc_score(y, h + m)
            out[name + "_paired"] = float(np.mean([b > a for a, b in zip(h, m)]))
        return out
    point = stat(trees)
    bs = [stat(list(rng.choice(trees, len(trees)))) for _ in range(boot)]
    return {k: [point[k], float(np.percentile([b[k] for b in bs], 2.5)), float(np.percentile([b[k] for b in bs], 97.5))]
            for k in point}


def main():
    rows = load()
    trees = sorted({r["tree"] for r in rows})
    rng = np.random.default_rng(SEED)
    res = {"n_threads": len(trees), "detectors": {}}
    for kind in ("ngram", "context", "length"):
        res["detectors"][kind] = metrics(rows, fold_scores(rows, kind), trees, rng)
    # ablation: drop every thread where either imitated turn looks like an assistant reply (bold, numbered list, "Sure,")
    bad = {r["tree"] for r in rows if r["label"] == 1 and ASSISTANTISM.search(r["text"])}
    clean = [r for r in rows if r["tree"] not in bad]
    ctrees = sorted({r["tree"] for r in clean})
    res["clean_threads"] = len(ctrees)
    res["detectors"]["ngram_clean"] = metrics(clean, fold_scores(clean, "ngram"), ctrees, rng)
    stats = {}
    for label, name in ((0, "human"), (1, "generated")):
        sel = [r for r in rows if r["label"] == label]
        stats[name] = {"median_chars": float(np.median([len(r["text"]) for r in sel])),
                       "assistant_style_share": float(np.mean([bool(ASSISTANTISM.search(r["text"])) for r in sel])),
                       "question_mark_share": float(np.mean(["?" in r["text"] for r in sel])),
                       "mean_overlap_with_prev_assistant": float(np.mean(
                           [len(words(r["text"]) & words(r["prev_a"])) / max(1, len(words(r["text"]))) for r in sel]))}
    res["text_stats"] = stats
    json.dump(res, open("results.json", "w"), indent=1)
    lines = [f"threads {len(trees)} (each: human turn 2, turn 3 and the plain-prompt imitation of both); 5-fold CV grouped by thread"]
    lines.append(f"{'detector':<9}" + "".join(f"{k:>26}" for k in ("turn2_auroc", "turn3_auroc", "thread_auroc", "thread_paired")))
    for kind, d in res["detectors"].items():
        lines.append(f"{kind:<11}" + "".join(f"{d[k][0]:>8.3f} [{d[k][1]:.3f},{d[k][2]:.3f}]" for k in
                                           ("turn2_auroc", "turn3_auroc", "thread_auroc", "thread_paired")))
    lines.append(f"ngram_clean = n-gram detector on the {len(ctrees)} threads with no assistant-style imitated turn")
    lines.append("")
    for name, s in stats.items():
        lines.append(f"{name:<10}" + "  ".join(f"{k}={v:.3f}" for k, v in s.items()))
    open("results.txt", "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
