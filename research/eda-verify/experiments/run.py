"""Mutation study: random vs coverage-directed vs formal on the p=8, wb=4 MAC accelerator. Writes mutants.jsonl and
results.txt. About 30-60 minutes on 4 cores (the formal stage dominates)."""
import json, os, sys, tempfile, time
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "src"), os.path.join(HERE, "..", "..", "chip-accel", "src"),
                os.path.join(HERE, "..", "..", "eda-harness", "src")]
from chip_accel import gen, model                      # noqa: E402
from eda_harness import harness as H                    # noqa: E402
from eda_verify import checks, mutate                   # noqa: E402

CAND = {"p": 8, "wb": 4}
SEEDS = 20           # random trials per mutant
NMAX = 64
ROM_SAMPLE = 15
K = gen.cycles(CAND["p"]) + 2


def tool_versions():
    return H.tool_versions()


def sim_stage(args):
    i, m = args
    P = H.Problem(); q = P.quant(CAND)
    out = {"i": i}
    t = time.perf_counter()
    try:
        first = []
        for s in range(SEEDS):
            rng = np.random.default_rng(1000 + s)
            lo, hi = -(1 << (q["wb"] - 1)), (1 << (q["wb"] - 1)) - 1
            xs = rng.integers(lo, hi + 1, (NMAX, 8))
            f = checks.sim_first_mismatch(q, CAND["p"], m["text"], xs)
            first.append(None if f is None else int(f))
    except RuntimeError:
        return {"i": i, "compiles": False}
    out.update(compiles=True, random_first=first, random_seconds=(time.perf_counter() - t) / SEEDS)
    # coverage-directed: a deterministic 16-vector set (greedy on reference coverage), plus its prefix budgets
    t = time.perf_counter()
    xs, cov = checks.directed_vectors(q, 16, seed=0)
    f = checks.sim_first_mismatch(q, CAND["p"], m["text"], xs)
    out.update(directed_first=None if f is None else int(f), directed_seconds=time.perf_counter() - t,
               directed_cov=len(cov))
    return out


def formal_stage(args):
    i, m, gold = args
    with tempfile.TemporaryDirectory() as d:
        v, s = checks.formal(gold, m["text"], K, d)
    return {"i": i, "formal": v, "formal_seconds": s}


def main():
    P = H.Problem(); gold = P.verilog(CAND)
    allm = mutate.sites(gold)
    rng = np.random.default_rng(0)
    rom = [m for m in allm if m["kind"] == "rom"]
    keep = [m for m in allm if m["kind"] != "rom"] + [rom[j] for j in sorted(rng.choice(len(rom), ROM_SAMPLE, replace=False))]
    for m in keep:
        m.pop("i", None)
    with Pool(4) as pool:
        sims = pool.map(sim_stage, list(enumerate(keep)))
    ok = [i for i, s in enumerate(sims) if s["compiles"]]
    print(f"{len(allm)} mutants enumerated, {len(keep)} sampled, {len(ok)} compile", flush=True)
    out = open(os.path.join(HERE, "mutants.jsonl"), "w")
    with Pool(4) as pool:
        for fr in pool.imap_unordered(formal_stage, [(i, keep[i], gold) for i in ok]):
            rec = {**sims[fr["i"]], **fr, "id": keep[fr["i"]]["id"], "kind": keep[fr["i"]]["kind"]}
            out.write(json.dumps(rec) + "\n"); out.flush()
            print(rec["id"], rec["formal"], round(rec["formal_seconds"]), flush=True)
    json.dump({"tools": tool_versions(), "candidate": CAND, "bound_cycles": K, "seeds": SEEDS,
               "n_enumerated": len(allm), "n_sampled": len(keep), "n_compile": len(ok)},
              open(os.path.join(HERE, "meta.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
