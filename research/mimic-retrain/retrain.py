"""Arms race between a black-box deletion attacker and a refitting word n-gram detector, AUROC per round.

Round r: the attacker edits every held-out machine text against the current detector D_r using only its score
(Q queries per text, delete the k types with the largest score drop, as in mimic-blackbox). The detector is then
refit (D_{r+1}) on the clean training texts plus every attacked training machine text produced so far, each
attacked against the detector of its own round. Also measured: D_r on clean held-out text, and D_r against the
stale round-0 attack (edits made against D_0). Writes results.json and results.txt.
"""
import json, os, random, sys
import numpy as np
from sklearn.metrics import roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))
CTX = os.path.join(HERE, "..", "mimic-contexts")
BB = os.path.join(HERE, "..", "mimic-blackbox")
sys.path.insert(0, BB)
import blackbox as B  # noqa: E402

W = B.W
ROUNDS = 4
Q, K = 50, 20


def attack_all(det, items, q, k, seed):
    """Attack the machine texts in items against det; human texts untouched. Returns (texts, mean queries)."""
    rng = random.Random(seed)
    texts, used = [], []
    for it in items:
        if it["y"]:
            t, u = B.attack(det, it["text"], q, k, rng)
            texts.append(t); used.append(u)
        else:
            texts.append(it["text"])
    return texts, float(np.mean(used)) if used else 0.0


def auroc(det, texts, y):
    return float(roc_auc_score(y, W.score(det, texts)))


def play(tr, held, rounds=ROUNDS, q=Q, k=K):
    ytr, y = [it["y"] for it in tr], [it["y"] for it in held]
    clean_tr = [it["text"] for it in tr]
    pool_t, pool_y = list(clean_tr), list(ytr)
    det = W.fit(pool_t, pool_y)
    rows, stale = [], None
    for r in range(rounds + 1):
        clean = auroc(det, [it["text"] for it in held], y)
        att, used = attack_all(det, held, q, k, 100 + r)
        if stale is None:
            stale = att
        rows.append({"round": r, "clean": clean, "attacked": auroc(det, att, y), "stale_round0_attack": auroc(det, stale, y), "queries_mean": used})
        print(rows[-1], flush=True)
        if r == rounds:
            break
        adv, _ = attack_all(det, tr, q, k, 200 + r)
        pool_t += [t for t, it in zip(adv, tr) if it["y"]]
        pool_y += [1] * sum(ytr)
        det = W.fit(pool_t, pool_y)
    return rows


def main():
    import evaluate as E
    os.chdir(CTX)
    items = E.load()
    tr = [it for it in items if it["family"] in E.TRAIN]
    held = [it for it in items if it["family"] in E.HELD]
    rows = play(tr, held)
    out = {"n_train": len(tr), "n_held": len(held), "n_machine_held": int(sum(it["y"] for it in held)), "q": Q, "k": K, "rows": rows}
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    L = [f"train {len(tr)}, held-out {len(held)} ({out['n_machine_held']} machine); attacker Q={Q} queries/text, k={K} types deleted",
         f"{'round':>5s} {'clean':>7s} {'attacked':>9s} {'stale r0 attack':>16s} {'mean queries':>13s}"]
    for r in rows:
        L.append(f"{r['round']:5d} {r['clean']:7.3f} {r['attacked']:9.3f} {r['stale_round0_attack']:16.3f} {r['queries_mean']:13.1f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
