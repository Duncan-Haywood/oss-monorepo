"""What does the n-gram detector key on? Writes artifacts.txt.

If the strongest features are chat-assistant boilerplate ("Sure", "Here is", "I hope"), the
detector is reading the chat template, not the writing, and an imitator can remove that cheaply.
Also re-scores the held-out families after deleting the first line of a text when it looks like
a chat preamble, to see how much of the held-out AUROC the preamble carries.
"""
import re
import numpy as np
from sklearn.metrics import roc_auc_score
import evaluate as E

PRE = re.compile(r"^\s*(sure|certainly|of course|here(?:'s| is| are)|title:|i hope|i'm happy|absolutely)", re.I)


def strip_pre(t):
    first, _, rest = t.partition("\n")
    return rest.lstrip() if PRE.match(first) and rest.strip() else t


def main():
    items = E.load()
    tr = [it for it in items if it["family"] in E.TRAIN]
    held = [it for it in items if it["family"] in E.HELD]
    y = [it["y"] for it in tr]
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    v = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=3, sublinear_tf=True, max_features=200000)
    clf = LogisticRegression(C=3.0, max_iter=2000).fit(v.fit_transform([it["text"] for it in tr]), y)
    names = np.array(v.get_feature_names_out()); w = clf.coef_[0]
    o = np.argsort(w)
    lines = ["top word 1-2-gram weights of a word-only logistic regression (train families)",
             "machine-like: " + ", ".join(names[o[-25:]][::-1]),
             "human-like:   " + ", ".join(names[o[:25]]), ""]
    n_pre = {l: sum(bool(PRE.match(it["text"].partition("\n")[0])) for it in items if it["label"] == l) for l in ("human", "llm")}
    lines.append(f"texts whose first line looks like a chat preamble: human {n_pre['human']}, llm {n_pre['llm']} of {sum(it['label']=='llm' for it in items)}")
    ng = E.ngram_fit([it["text"] for it in tr], y)
    for tag, f in (("as shipped", lambda t: t), ("preamble stripped from held-out texts", strip_pre)):
        s = ng([f(it["text"]) for it in held])
        lines.append(f"n-gram detector, held-out families, {tag}: AUROC {roc_auc_score([it['y'] for it in held], s):.3f}")
    ng2 = E.ngram_fit([strip_pre(it["text"]) for it in tr], y)
    s = ng2([strip_pre(it["text"]) for it in held])
    lines.append(f"n-gram detector refit with preambles stripped everywhere: held-out AUROC {roc_auc_score([it['y'] for it in held], s):.3f}")
    open("artifacts.txt", "w").write("\n".join(lines) + "\n"); print("\n".join(lines))


if __name__ == "__main__":
    main()
