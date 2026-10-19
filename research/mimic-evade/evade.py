"""How far do cheap surface edits to machine text move the mimic-contexts n-gram detector?

Edits are applied to the LLM texts only (an imitator controls its own output). The detector is fit on
unedited training families, as in mimic-contexts. A second, adaptive detector is refit with the same
edit applied to the training machine texts. Writes results.json and results.txt.
"""
import json, os, random, re, sys
import numpy as np
from sklearn.metrics import roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))
CTX = os.path.join(HERE, "..", "mimic-contexts")
sys.path.insert(0, CTX)
import evaluate as E  # noqa: E402

PRE = re.compile(r"^\s*(sure|certainly|here is|here's|of course)[^\n]*\n+", re.I)
CONTR = [("do not", "don't"), ("does not", "doesn't"), ("it is", "it's"), ("cannot", "can't"), ("is not", "isn't"),
         ("that is", "that's"), ("they are", "they're"), ("we are", "we're"), ("I am", "I'm"), ("will not", "won't")]
KB = "qwertyuiopasdfghjklzxcvbnm"


def e_lower(t, r): return t.lower()
def e_flat(t, r): return re.sub(r"\s+", " ", t).strip()
def e_nomd(t, r): return re.sub(r"^\s*([-*•]|\d+\.)\s+", "", re.sub(r"[*_#`]", "", t), flags=re.M)
def e_preamble(t, r): return PRE.sub("", t)
def e_contract(t, r):
    for a, b in CONTR:
        t = re.sub(r"\b" + a + r"\b", b, t, flags=re.I)
    return t
def e_typos(t, r, p=0.02):
    out = []
    for i, c in enumerate(t):
        if c.isalpha() and r.random() < p:
            k = r.random()
            if k < 0.34: continue                      # drop
            if k < 0.67: out.append(c); out.append(c)   # double
            else: out.append(r.choice(KB))             # substitute
        else:
            out.append(c)
    return "".join(out)
def e_half(t, r): return t[: max(1, len(t) // 2)]
def e_all(t, r):
    for f in (e_preamble, e_nomd, e_contract, e_flat, e_lower, e_typos):
        t = f(t, r)
    return t


EDITS = {"lowercase": e_lower, "flatten whitespace": e_flat, "strip markdown/bullets": e_nomd, "drop preamble": e_preamble,
         "contractions": e_contract, "2% typos": e_typos, "first half only": e_half, "all but half": e_all}


def apply(items, fn, seed, which=("llm",)):
    r = random.Random(seed)
    return [dict(it, text=fn(it["text"], r) if it["label"] in which else it["text"]) for it in items]


def auc(score, its):
    return float(roc_auc_score([it["y"] for it in its], score([it["text"] for it in its])))


def boot_diff(y, s0, s1, rng, B=300):
    y, s0, s1 = map(np.asarray, (y, s0, s1)); n = len(y); v = []
    for _ in range(B):
        i = np.array([rng.randrange(n) for _ in range(n)])
        if len(set(y[i])) == 2:
            v.append(roc_auc_score(y[i], s1[i]) - roc_auc_score(y[i], s0[i]))
    return float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))


def main():
    os.chdir(CTX)
    items = E.load()
    tr = [it for it in items if it["family"] in E.TRAIN]
    held = [it for it in items if it["family"] in E.HELD]
    base = E.ngram_fit([it["text"] for it in tr], [it["y"] for it in tr])
    y = [it["y"] for it in held]
    s0 = list(base([it["text"] for it in held]))
    out = {"baseline": {"auroc": float(roc_auc_score(y, s0)), "machine_mean_score": float(np.mean([s for s, v in zip(s0, y) if v]))},
           "edits": {}}
    rng = random.Random(E.SEED)
    for name, fn in EDITS.items():
        h1 = apply(held, fn, 1)
        s1 = list(base([it["text"] for it in h1]))
        both = apply(held, fn, 1, which=("llm", "human"))
        sb = list(base([it["text"] for it in both]))
        tr1 = apply(tr, fn, 2)
        ad = E.ngram_fit([it["text"] for it in tr1], [it["y"] for it in tr1])
        sa = list(ad([it["text"] for it in h1]))
        out["edits"][name] = {
            "auroc_machine_edited": float(roc_auc_score(y, s1)),
            "diff_ci95": boot_diff(y, s0, s1, rng),
            "auroc_both_edited": float(roc_auc_score(y, sb)),
            "auroc_adaptive_detector": float(roc_auc_score(y, sa)),
            "mean_chars_machine": float(np.mean([len(it["text"]) for it in h1 if it["y"]]))}
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    L = [f"baseline held-out AUROC {out['baseline']['auroc']:.3f}",
         f"{'edit':26s} {'machine-edited':>14s} {'95% CI of diff':>20s} {'both-edited':>11s} {'adaptive':>9s}"]
    for n, e in out["edits"].items():
        L.append(f"{n:26s} {e['auroc_machine_edited']:14.3f} {str(['%.3f' % x for x in e['diff_ci95']]):>20s} {e['auroc_both_edited']:11.3f} {e['auroc_adaptive_detector']:9.3f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
