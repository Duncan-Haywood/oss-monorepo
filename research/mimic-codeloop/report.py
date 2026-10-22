"""Summarise results/*.json against mimic-cursor's component search at the same candidate budget.

Writes results.txt and results.json. Usage: python3 report.py
"""
import glob
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CUR = os.path.join(HERE, "..", "mimic-cursor", "results")


def load(pattern):
    return [json.load(open(p)) for p in sorted(glob.glob(pattern))]


def boot(x, n=2000, seed=0):
    x = np.asarray(x, float)
    if len(x) < 2:
        return float(x.mean()), None, None
    rng = np.random.default_rng(seed)
    m = [rng.choice(x, len(x)).mean() for _ in range(n)]
    return float(x.mean()), float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


def fmt(t):
    m, lo, hi = t
    return f"{m:.3f}" if lo is None else f"{m:.3f} ({lo:.3f} to {hi:.3f})"


def main():
    out, js = [], {}
    code = {c: load(os.path.join(HERE, "results", f"run_{c}_*.json")) for c in ("blind", "feedback")}
    comp = {"blind": load(os.path.join(CUR, "run_blind_*.json")), "feedback": load(os.path.join(CUR, "run_d2i_*.json"))}
    rounds = max((len(r["rounds"]) - 1 for rs in code.values() for r in rs), default=0)
    out.append(f"rounds per code-model run: {rounds}; candidates per run: {rounds * 4}")
    for c, rs in code.items():
        if not rs:
            continue
        final = [r["rounds"][-1]["reference"] for r in rs]
        loop = [r["rounds"][-1]["loop_test"] for r in rs]
        best = [min(x["reference"] for x in r["rounds"]) for r in rs]
        cands = [k for r in rs for x in r["rounds"][1:] for k in x["candidates"]]
        valid = np.mean([k["valid"] for k in cands])
        errs = {}
        for k in cands:
            e = k.get("error") or ("crashes or copies" if not k["valid"] else "valid")
            e = e.split(":")[0] if e != "valid" else e
            errs[e] = errs.get(e, 0) + 1
        n = len(cands)
        out.append(f"\ncode model, {c}: {len(rs)} runs, {n} candidates, {valid:.0%} valid")
        out.append(f"  final reference AUROC {fmt(boot(final))}; best round {fmt(boot(best))}; final loop detector {fmt(boot(loop))}")
        out.append("  outcomes: " + ", ".join(f"{k} {v}" for k, v in sorted(errs.items(), key=lambda kv: -kv[1])))
        js[c] = {"runs": len(rs), "candidates": n, "valid_share": float(valid), "final_reference": final,
                 "best_reference": best, "final_loop": loop, "outcomes": errs}
        ref_c = comp[c]
        if ref_c:
            at = [r["rounds"][min(rounds, len(r["rounds"]) - 1)]["reference"] for r in ref_c]
            out.append(f"  component search at the same budget (round {rounds}, {len(ref_c)} runs): reference AUROC {fmt(boot(at))}")
            js[c]["component_same_budget"] = at
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(js, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("\n".join(out))


if __name__ == "__main__":
    main()
