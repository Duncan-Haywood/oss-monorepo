"""Re-score the saved imitator texts of results/<family>_matrix.json with a larger detector model.

The texts were written by Qwen2.5-0.5B-Instruct and are not regenerated; only the detector's model
changes (same prompts, same paired A/B protocol). Writes results/<family>_matrix_<tag>.json with the
margins only.
"""
import argparse, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-loop"))
sys.path.insert(0, HERE)
import core  # noqa: E402
import crossplay  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--family", required=True); ap.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
    ap.add_argument("--tag", default="q15"); ap.add_argument("--threads", type=int, default=4)
    a = ap.parse_args()
    from lm import LM
    from game import Game
    m = json.load(open(os.path.join(HERE, "results", f"{a.family}_matrix.json")))
    ctx = core.load_contexts(a.family, seed=m["seed"])
    test, fresh = crossplay.titles(ctx)
    items = test + fresh
    g = Game(LM(model=a.model, threads=a.threads), a.family, ctx, m["seed"])
    out = {"family": a.family, "model": a.model, "margins": []}
    t0 = time.time()
    for j, dt in enumerate(m["detectors"]):
        out["margins"].append([g.margins({"text": dt["text"]}, items, im["texts"], seed=0) for im in m["imitators"]])
        print(f"{a.family} {a.tag} detector {j + 1}/{len(m['detectors'])} {time.time() - t0:.0f}s", flush=True)
    out["model_calls"] = dict(g.lm.calls)
    json.dump(out, open(os.path.join(HERE, "results", f"{a.family}_matrix_{a.tag}.json"), "w"))
