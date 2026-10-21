"""Does a human-vs-machine text detector carry over to a text generator it never saw?

mimic-featuretransfer held out context families. This holds out the *generator* (mistral-chat, llama-chat,
mpt-chat) and the *decoding* (greedy vs sampling) on the mimic-contexts suite (RAID text). Items sharing a
source_id are kept in the same fold, so a human text and a machine text written from the same prompt never
straddle train and test. Five folds over source groups; in each fold the test set is the held-out generator's
machine texts plus the human texts of that fold, and training uses every other generator's machine texts plus
the human texts of the other folds. Reported: mean AUROC over folds and its standard deviation.
Reference condition "none held out": same folds, test machine texts from every generator.
"""
import gzip, json, os, sys, zlib
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-featuretransfer"))
import featuretransfer as ft

GENERATORS = ["mistral-chat", "llama-chat", "mpt-chat"]
SETS = ["func", "word", "char", "char+word"]
K = 5


def fold_of(item, k=K):
    return zlib.crc32(str(item["source_id"]).encode()) % k


def conditions(items):
    """name -> (is_train_machine, is_test_machine) predicates on machine items."""
    c = {"none held out": (lambda i: True, lambda i: True)}
    for g in GENERATORS:
        c[f"hold out {g}"] = (lambda i, g=g: i["model"] != g, lambda i, g=g: i["model"] == g)
    for d, o in (("greedy", "sampling"), ("sampling", "greedy")):
        c[f"train {d} only, test {o}"] = (lambda i, d=d: i["decoding"] == d, lambda i, o=o: i["decoding"] == o)
    return c


def run(items, sets=SETS, k=K):
    for it in items: it["fold"] = fold_of(it, k)
    out = {}
    for cname, (trm, tem) in conditions(items).items():
        out[cname] = {}
        for s in sets:
            aucs = []
            for f in range(k):
                train = [i for i in items if i["fold"] != f and (i["y"] == 0 or trm(i))]
                test = [i for i in items if i["fold"] == f and (i["y"] == 0 or tem(i))]
                y = [i["y"] for i in test]
                aucs.append(ft.auc(y, ft.score(s, train, test)))
            out[cname][s] = {"mean": float(np.mean(aucs)), "sd": float(np.std(aucs, ddof=1)), "folds": aucs}
    return out


def counts(items):
    return {g: sum(1 for i in items if i["model"] == g) for g in GENERATORS} | {"human": sum(1 for i in items if i["y"] == 0)}


def table(res, sets=SETS):
    L = ["| condition | " + " | ".join(sets) + " |", "|" + "---|" * (len(sets) + 1)]
    for c, r in res.items():
        L.append(f"| {c} | " + " | ".join(f"{r[s]['mean']:.3f} ± {r[s]['sd']:.3f}" for s in sets) + " |")
    return "\n".join(L)


if __name__ == "__main__":
    items = ft.load(); res = run(items)
    json.dump({"counts": counts(items), "results": res}, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write(table(res) + "\n")
    print(table(res))
