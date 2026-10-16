"""Measure Yosys structural features for the 27 eda-verify simulation survivors. Needs yosys (apt) and numpy;
about a minute. Writes experiments/features.jsonl (one row per survivor: id, formal verdict, features)."""
import json, os, sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "..", "..")
sys.path[:0] = [os.path.join(R, d, "src") for d in ("eda-conefeat", "eda-verify", "chip-accel", "eda-harness", "eda-equivpredict")]
from eda_harness import harness as H      # noqa: E402
from eda_verify import mutate             # noqa: E402
from eda_conefeat import feat             # noqa: E402
from eda_equivpredict import predict as P  # noqa: E402

CAND = {"p": 8, "wb": 4}
GOLD = H.Problem().verilog(CAND)
GC = feat.synth_cells(GOLD)


def sampled():
    """The mutant list eda-verify sampled (same seed), so the log's `i` indexes it. Ids alone repeat."""
    import numpy as np
    allm = mutate.sites(GOLD)
    rng = np.random.default_rng(0)
    rom = [m for m in allm if m["kind"] == "rom"]
    return [m for m in allm if m["kind"] != "rom"] + [rom[j] for j in sorted(rng.choice(len(rom), 15, replace=False))]


KEEP = sampled()


def one(r):
    m = KEEP[r["i"]]
    assert m["id"] == r["id"], (m["id"], r["id"])
    f = feat.features(GOLD, m["text"], GC)
    return {"i": r["i"], "id": r["id"], "formal": r["formal"], **f}


if __name__ == "__main__":
    surv = P.survivors(P.load())
    with Pool(4) as pool:
        rows = pool.map(one, surv)
    with open(os.path.join(HERE, "features.jsonl"), "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    print(len(rows), "survivors; golden cells", GC[0])
