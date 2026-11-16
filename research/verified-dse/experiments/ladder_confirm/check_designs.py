"""Milestone 137: checks every candidate design before any flow run (Yosys on PATH; about a minute).

Each candidate is checked against a Python reference with Yosys `eval` on 30 vectors (seed 137), including all-zero and all-one
operands. Prints one line per design and exits 1 on any mismatch. Uses experiments/shift_power/check_designs.py's `evaluate`,
unchanged.
"""
import importlib.util
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("vdse_m120_check_for_m137", HERE.parent / "shift_power" / "check_designs.py")
chk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chk)
spec = importlib.util.spec_from_file_location("vdse_m137_run_for_check", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def ports(stem, p):
    """Input names and widths, and the reference, for one family."""
    w, sw = p["W"], p["SW"]
    mask, smask = (1 << w) - 1, (1 << sw) - 1
    shl = lambda v, s: {"y": (v["x"] << (s & smask)) & mask}
    if stem == "isqrtsh_w":
        return {"x": w, "a": p["NA"]}, lambda v: shl(v, math.isqrt(v["a"]))
    if stem == "argminsh_w":
        n, nb = p["N"], p["NB"]

        def amin(v):
            fs = [(v["f"] >> (nb * i)) & ((1 << nb) - 1) for i in range(n)]
            return shl(v, fs.index(min(fs)))
        return {"x": w, "f": n * nb}, amin
    if stem == "csumsh_w":
        k = p["K"]

        def csum(v):
            acc = 0
            for i in range(k):
                t = acc + ((v["b"] >> (sw * i)) & smask)
                acc = ((t & smask) + (t >> sw)) & smask
            return shl(v, acc)
        return {"x": w, "b": k * sw}, csum
    k = p["K"]
    return ({"x": w, "p": 4 * k, "q": 4 * k},
            lambda v: shl(v, sum(((v["p"] >> (4 * i)) & 15) == ((v["q"] >> (4 * i)) & 15) for i in range(k))))


def main():
    rng = random.Random(137)
    ok = True
    for name, (stem, _, params, _) in run.CAND.items():
        widths, ref = ports(stem, params)
        vs = [{k: 0 for k in widths}, {k: (1 << w) - 1 for k, w in widths.items()},
              {k: (1 if k == "x" else (1 << w) - 1) for k, w in widths.items()},
              {k: (1 << (w - 1) if k == "x" else 0) for k, w in widths.items()}]
        if stem == "eqcntsh_w":  # random nibbles rarely match: half the vectors share most nibbles
            for _ in range(13):
                pv = rng.getrandbits(widths["p"])
                qv = pv ^ sum(rng.randrange(16) << (4 * i) for i in range(params["K"]) if rng.random() < 0.3)
                vs.append({"x": rng.getrandbits(w := widths["x"]), "p": pv, "q": qv})
        vs += [{k: rng.getrandbits(w) for k, w in widths.items()} for _ in range(30 - len(vs))]
        bad = sum(chk.evaluate(stem, params, v, ["y"], widths) != ref(v) for v in vs)
        print(f"{name}: {len(vs) - bad}/{len(vs)} vectors match", flush=True)
        ok &= bad == 0
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
