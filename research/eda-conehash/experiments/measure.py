"""Measure fan-in cone features for the 27 eda-verify simulation survivors. Needs yosys (apt) and numpy (for the
`eda-harness` generator); about two minutes. Writes experiments/features.jsonl (id, formal verdict, cone features)."""
import json, os, sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "..", "..")
sys.path[:0] = [os.path.join(R, d, "src") for d in ("eda-conehash", "eda-verify", "chip-accel", "eda-harness", "eda-equivpredict")]
sys.path.append(os.path.join(R, "eda-conefeat", "experiments"))
import run as base                          # noqa: E402  (eda-conefeat's run.py: GOLD, KEEP, same sampling)
from eda_conehash import cone               # noqa: E402
from eda_equivpredict import predict as P   # noqa: E402

GS = cone.analyse(cone.netlist(base.GOLD))


def one(r):
    m = base.KEEP[r["i"]]
    assert m["id"] == r["id"], (m["id"], r["id"])
    return {"i": r["i"], "id": r["id"], "formal": r["formal"], **cone.features(GS, cone.analyse(cone.netlist(m["text"])))}


if __name__ == "__main__":
    surv = P.survivors(P.load())
    with Pool(4) as pool:
        rows = pool.map(one, surv)
    with open(os.path.join(HERE, "features.jsonl"), "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    print(len(rows), "survivors;", len(GS), "golden sinks")
