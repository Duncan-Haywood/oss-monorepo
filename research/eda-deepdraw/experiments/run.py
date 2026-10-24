"""Deep random draw on the eda-verify mutants that 64-vector random testing never caught (plus the fixed-index one).

Regenerates the mutants exactly as eda-verify/experiments/run.py did (same sampling seed), checks each regenerated id
against the committed log, then simulates NVEC uniform random vectors per mutant in chunks and records the index of the
first mismatch. Writes draws.jsonl next to this file. Needs iverilog (apt) and numpy.

    python experiments/run.py [NVEC]     # default 20000; a few minutes on 4 cores
"""
import json, os, sys, time
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "..", "..")
sys.path[:0] = [os.path.join(R, "eda-verify", "src"), os.path.join(R, "chip-accel", "src"), os.path.join(R, "eda-harness", "src")]
from chip_accel import gen                      # noqa: E402
from eda_harness import harness as H            # noqa: E402
from eda_verify import checks, mutate           # noqa: E402

CAND = {"p": 8, "wb": 4}
CHUNK = 2000
SEED = 777
LOG = os.path.join(R, "eda-verify", "experiments", "mutants.jsonl")
checks.SIM_TIMEOUT = 120


def regenerate():
    gold = H.Problem().verilog(CAND)
    allm = mutate.sites(gold)
    rng = np.random.default_rng(0)
    rom = [m for m in allm if m["kind"] == "rom"]
    return [m for m in allm if m["kind"] != "rom"] + [rom[j] for j in sorted(rng.choice(len(rom), 15, replace=False))]


def targets():
    keep = regenerate()
    rows = [json.loads(l) for l in open(LOG)]
    out = []
    for r in rows:
        if not r["compiles"]:
            continue
        assert keep[r["i"]]["id"] == r["id"], (r["i"], r["id"])
        ff = [f for f in r["random_first"] if f is not None]
        if not ff or len(set(ff)) == 1 and len(ff) == 20 and ff[0] != 0:
            out.append((r["id"], r["formal"], keep[r["i"]]["text"]))
    return out


def draw(args):
    mid, formal, text, nvec = args
    P = H.Problem(); q = P.quant(CAND)
    lo, hi = -(1 << (q["wb"] - 1)), (1 << (q["wb"] - 1)) - 1
    rng = np.random.default_rng(SEED)           # same vectors for every mutant
    first, t = None, time.perf_counter()
    for c in range(nvec // CHUNK):
        xs = rng.integers(lo, hi + 1, (CHUNK, 8))
        f = checks.sim_first_mismatch(q, CAND["p"], text, xs)
        if f is not None:
            first = c * CHUNK + int(f); break
    return {"id": mid, "formal": formal, "nvec": nvec, "first": first, "seconds": time.perf_counter() - t}


def main():
    nvec = int(sys.argv[1]) if len(sys.argv) > 1 else 20000
    tg = targets()
    print(len(tg), "targets", flush=True)
    with Pool(4) as pool, open(os.path.join(HERE, "draws.jsonl"), "w") as out:
        for r in pool.imap(draw, [(a, b, c, nvec) for a, b, c in tg]):
            out.write(json.dumps(r) + "\n"); out.flush(); print(r, flush=True)


if __name__ == "__main__":
    main()
