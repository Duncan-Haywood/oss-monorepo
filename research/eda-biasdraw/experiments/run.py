"""Biased-input draw on the 26 eda-deepdraw targets (25 survivors of uniform testing plus del@122), and a row-count
check of del@122.

Four generators, NVEC vectors each (default 5000): extreme (every input -8 or 7), sparse (each input 0 with prob 0.8,
else uniform), onehot (one random input at -8 or 7, the rest 0), mixed (per-vector random choice among uniform, extreme,
sparse, onehot). Targets and mutant text come from eda-deepdraw. Writes bias.jsonl and rows.json next to this file.

    python experiments/run.py [NVEC]
"""
import json, os, re, subprocess, sys, tempfile, time
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "..", "..")
sys.path[:0] = [os.path.join(R, "eda-deepdraw", "experiments"), os.path.join(R, "eda-verify", "src"),
                os.path.join(R, "chip-accel", "src"), os.path.join(R, "eda-harness", "src")]
import run as D                                  # noqa: E402  (eda-deepdraw's run.py)
from eda_verify import checks                    # noqa: E402
from eda_harness import harness as H             # noqa: E402

LO, HI, CHUNK, SEED = -8, 7, 1000, 4242
GENS = ["extreme", "sparse", "onehot", "mixed"]


def make(kind, rng, n):
    if kind == "extreme":
        return rng.choice([LO, HI], (n, 8))
    if kind == "sparse":
        return np.where(rng.random((n, 8)) < 0.8, 0, rng.integers(LO, HI + 1, (n, 8)))
    if kind == "onehot":
        x = np.zeros((n, 8), dtype=int); x[np.arange(n), rng.integers(0, 8, n)] = rng.choice([LO, HI], n); return x
    parts = [make(k, rng, n) for k in ("extreme", "sparse", "onehot")] + [rng.integers(LO, HI + 1, (n, 8))]
    return np.choose(rng.integers(0, 4, n)[:, None], parts)


def draw(args):
    mid, formal, text, nvec = args
    q = H.Problem().quant(D.CAND)
    res = {"id": mid, "formal": formal, "nvec": nvec, "first": {}}
    for kind in GENS:
        rng = np.random.default_rng(SEED)
        first = None
        for c in range(nvec // CHUNK):
            f = checks.sim_first_mismatch(q, D.CAND["p"], text, make(kind, rng, CHUNK))
            if f is not None:
                first = c * CHUNK + int(f); break
        res["first"][kind] = first
    return res


def row_count(text, n=100):
    """Output rows del@122 prints for n vectors (a count, to confirm truncation vs wrong values)."""
    q = H.Problem().quant(D.CAND)
    xs = np.random.default_rng(1).integers(LO, HI + 1, (n, 8))
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/a.v", "w").write(text); open(f"{d}/tb.v", "w").write(checks._tb(q["wb"], xs))
        subprocess.run(["iverilog", "-g2012", "-o", f"{d}/s", f"{d}/a.v", f"{d}/tb.v"], check=True)
        out = subprocess.run(["vvp", f"{d}/s"], capture_output=True, text=True, timeout=120).stdout
    return len(re.findall(r"OUT (\d+) (\d) (\d+)", out)), n


def main():
    nvec = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    tg = D.targets()
    print(len(tg), "targets", flush=True)
    dl = [t for t in tg if t[0].startswith("del@122")][0]
    rows, n = row_count(dl[2])
    json.dump({"id": dl[0], "vectors": n, "rows": rows}, open(os.path.join(HERE, "rows.json"), "w"))
    print("del@122 rows", rows, "of", n, flush=True)
    with Pool(4) as pool, open(os.path.join(HERE, "bias.jsonl"), "w") as out:
        for r in pool.imap(draw, [(a, b, c, nvec) for a, b, c in tg]):
            out.write(json.dumps(r) + "\n"); out.flush(); print(r, flush=True)


if __name__ == "__main__":
    main()
