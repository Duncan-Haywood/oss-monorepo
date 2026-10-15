"""Score every imitator prompt of a mimic-loop family against every detector prompt of that family.

Reads ../mimic-loop/results/<family>_<proposer>_s<seed>.json (prompts only; no model call is
reused), regenerates each imitator's texts, and scores each (imitator, detector) cell with the same
frozen Qwen2.5-0.5B-Instruct and the same paired A/B detector the loop used. Writes
results/<family>_matrix.json. Titles: the loop's 24 held-out test titles ("test") and 24 further
titles from the same family that no loop step ever touched ("fresh").
"""
import argparse, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
LOOP = os.path.join(HERE, "..", "mimic-loop")
sys.path.insert(0, LOOP)
import core  # noqa: E402

PROPOSERS = ("random", "ga", "grips", "llm")


def collect(family, seed=0, results_dir=None):
    """Unique imitator and detector prompts of a family, with where each appeared."""
    results_dir = results_dir or os.path.join(LOOP, "results")
    imits, dets = {}, {}
    for p in PROPOSERS:
        rec = json.load(open(os.path.join(results_dir, f"{family}_{p}_s{seed}.json")))
        for row in rec["rounds"]:
            ik = (row["imitator"], tuple(row["imitator_shots"]))
            imits.setdefault(ik, {"text": row["imitator"], "shots": tuple(row["imitator_shots"]), "origin": []})
            imits[ik]["origin"].append([p, row["round"]])
            dk = row["detector"]
            dets.setdefault(dk, {"text": row["detector"], "origin": []})
            dets[dk]["origin"].append([p, row["round"]])
    return list(imits.values()), list(dets.values())


def titles(ctx, n_fresh=24):
    """Loop test items, then fresh items: the refs not used as opt, test or few-shot pool."""
    used = {x["id"] for k in ("opt", "test", "pool") for x in ctx[k]}
    fresh = [x for x in ctx["refs"] if x["id"] not in used][:n_fresh]
    assert len(fresh) == n_fresh
    return ctx["test"], fresh


def run(lm, family, seed=0, log=print):
    from game import Game
    ctx = core.load_contexts(family, seed=seed)
    g = Game(lm, family, ctx, seed)
    imits, dets = collect(family, seed)
    test, fresh = titles(ctx)
    items = test + fresh
    out = {"family": family, "seed": seed, "n_test": len(test), "n_fresh": len(fresh),
           "imitators": [], "detectors": dets, "margins": []}
    texts = []
    for i, im in enumerate(imits):
        tx = g.write({"text": im["text"], "shots": im["shots"]}, items, seed=999)
        ok, mlen, cr = g.valid(tx)
        rec = dict(im, shots=list(im["shots"]), texts=tx, mean_len=mlen, copy4=cr, valid=ok,
                   distinct2=core.distinct_n(tx))
        out["imitators"].append(rec)
        texts.append(tx)
    out["ref_len"] = g.ref_len
    out["human_distinct2"] = core.distinct_n([x["text"] for x in items])
    t0 = time.time()
    for j, dt in enumerate(dets):
        row = []
        for i, tx in enumerate(texts):
            row.append(g.margins({"text": dt["text"]}, items, tx, seed=0))
        out["margins"].append(row)  # margins[j][i][k]: detector j, imitator i, title k
        log(f"{family} detector {j + 1}/{len(dets)} done, {time.time() - t0:.0f}s")
    out["model_calls"] = dict(lm.calls)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--family", required=True); ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--threads", type=int, default=2)
    a = ap.parse_args()
    from lm import LM
    res = run(LM(threads=a.threads), a.family, a.seed)
    json.dump(res, open(os.path.join(HERE, "results", f"{a.family}_matrix.json"), "w"))
