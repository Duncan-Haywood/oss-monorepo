"""Black-box evasion of a word n-gram human-vs-machine detector, AUROC against query budget.

The imitator sees only the detector's score for a text it submits (no weights). For each held-out machine text it
spends Q queries: it deletes each of Q randomly drawn word types in turn, reads the score drop, then deletes the
k types with the biggest drop (k = 10 and 20). Q = 0 is the blind control (k random types). The white-box attack
of mimic-whitebox, which reads the weights, is the ceiling. Human texts are untouched. Writes results.json and
results.txt.
"""
import json, os, random, re, sys
import numpy as np
from sklearn.metrics import roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))
CTX = os.path.join(HERE, "..", "mimic-contexts")
WB = os.path.join(HERE, "..", "mimic-whitebox")
sys.path.insert(0, WB)
import whitebox as W  # noqa: E402

QUERIES = [0, 10, 25, 50, 100, 200]
KS = [10, 20]
TOK = W.TOK


def types(text):
    return sorted(set(t.lower() for t in TOK.findall(text) if t.strip() and t[0].isalnum()))


def delete(text, drop):
    out = [t for t in TOK.findall(text) if t.lower() not in drop]
    return re.sub(r"[ \t]{2,}", " ", "".join(out))


def attack(det, text, q, k, rng):
    """Black-box: det is used only through W.score (one query per candidate deletion)."""
    ts = types(text)
    if not ts:
        return text, 0
    if q == 0:
        return delete(text, set(rng.sample(ts, min(k, len(ts))))), 0
    cand = rng.sample(ts, min(q, len(ts)))
    s0 = W.score(det, [text])[0]
    drops = s0 - W.score(det, [delete(text, {c}) for c in cand])
    order = np.argsort(-drops)[:k]
    return delete(text, {cand[i] for i in order if drops[i] > 0}), len(cand) + 1


def main():
    import evaluate as E
    os.chdir(CTX)
    items = E.load()
    tr = [it for it in items if it["family"] in E.TRAIN]
    held = [it for it in items if it["family"] in E.HELD]
    y = [it["y"] for it in held]
    det = W.fit([it["text"] for it in tr], [it["y"] for it in tr])
    out = {"n_held": len(held), "n_machine": int(sum(y)), "base": float(roc_auc_score(y, W.score(det, [it["text"] for it in held]))), "rows": []}
    for k in KS:
        for q in QUERIES:
            rng = random.Random(1000 * k + q)
            texts, used = [], []
            for it in held:
                if it["y"]:
                    t, u = attack(det, it["text"], q, k, rng)
                    texts.append(t); used.append(u)
                else:
                    texts.append(it["text"])
            out["rows"].append({"k": k, "q": q, "queries_mean": float(np.mean(used)), "auroc": float(roc_auc_score(y, W.score(det, texts)))})
            print(out["rows"][-1], flush=True)
        rng = random.Random(7)
        texts = [W.attack(det, it["text"], k, "delete", "") if it["y"] else it["text"] for it in held]
        out.setdefault("whitebox", {})[str(k)] = float(roc_auc_score(y, W.score(det, texts)))
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    L = [f"held-out machine texts {out['n_machine']} of {out['n_held']}; unattacked AUROC {out['base']:.3f}",
         f"{'k':>3s} {'queries Q':>9s} {'mean queries used':>18s} {'AUROC':>7s}"]
    for r in out["rows"]:
        L.append(f"{r['k']:3d} {r['q']:9d} {r['queries_mean']:18.1f} {r['auroc']:7.3f}")
    for k, a in out["whitebox"].items():
        L.append(f"white-box ceiling (reads weights), k={k}: {a:.3f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
