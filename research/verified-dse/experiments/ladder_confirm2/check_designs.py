"""Milestone 138: checks every candidate design before any flow run (Yosys on PATH; a few minutes).

Each candidate is checked against a Python reference with Yosys `eval` on 30 vectors (seed 138), including all-zero and all-one
operands. Prints one line per design and exits 1 on any mismatch. Uses experiments/shift_power/check_designs.py's `evaluate`,
unchanged; the same structure as experiments/ladder_confirm/check_designs.py.
"""
import importlib.util
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("vdse_m120_check_for_m138", HERE.parent / "shift_power" / "check_designs.py")
chk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chk)
spec = importlib.util.spec_from_file_location("vdse_m138_run_for_check", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def ports(stem, p):
    """Input names and widths, and the reference, for one family."""
    w, sw, right = p["W"], p["SW"], p["R"]
    mask, smask = (1 << w) - 1, (1 << sw) - 1
    sh = lambda v, s: {"y": (v["x"] >> (s & smask)) if right else (v["x"] << (s & smask)) & mask}
    if stem == "divsh_w":
        na, nb = p["NA"], p["NB"]
        return {"x": w, "a": na, "b": nb}, lambda v: sh(v, (1 << na) - 1 if v["b"] == 0 else v["a"] // v["b"])
    if stem == "clampsh_w":
        k, nb = p["K"], p["NB"]
        m = (1 << nb) - 1

        def clamp(v):
            acc = 0
            for i in range(k):
                f = lambda n: (v[n] >> (nb * i)) & m
                acc = min(max((acc + f("a")) & m, f("lo")), f("hi"))
            return sh(v, acc)
        return {"x": w, "a": k * nb, "lo": k * nb, "hi": k * nb}, clamp
    if stem == "rngsh_w":
        n, nb = p["N"], p["NB"]

        def rng_(v):
            fs = [(v["f"] >> (nb * i)) & ((1 << nb) - 1) for i in range(n)]
            return sh(v, max(fs) - min(fs))
        return {"x": w, "f": n * nb}, rng_
    if stem == "dotsh_w":
        k = p["K"]
        return ({"x": w, "p": 3 * k, "q": 3 * k},
                lambda v: sh(v, sum(((v["p"] >> (3 * i)) & 7) * ((v["q"] >> (3 * i)) & 7) for i in range(k))))
    n, nb = p["N"], p["NB"]
    return ({"x": w, "f": n * nb, "t": nb},
            lambda v: sh(v, sum(((v["f"] >> (nb * i)) & ((1 << nb) - 1)) > v["t"] for i in range(n))))


def main():
    rng = random.Random(138)
    ok = True
    for name, (stem, _, params, _) in run.CAND.items():
        widths, ref = ports(stem, params)
        vs = [{k: 0 for k in widths}, {k: (1 << w) - 1 for k, w in widths.items()},
              {k: (1 if k == "x" else (1 << w) - 1) for k, w in widths.items()},
              {k: (1 << (w - 1) if k == "x" else 0) for k, w in widths.items()}]
        if stem == "divsh_w":  # small divisors and dividends exercise every quotient range
            vs += [{"x": rng.getrandbits(widths["x"]), "a": rng.getrandbits(widths["a"]) >> rng.randrange(widths["a"]),
                    "b": rng.randrange(1, 1 << widths["b"])} for _ in range(10)]
        if stem == "clampsh_w":  # ordered bounds, so the clamp is not always pinned at hi
            for _ in range(10):
                k, nb = params["K"], params["NB"]
                lo = sum(rng.randrange(0, 1 << (nb - 2)) << (nb * i) for i in range(k))
                hi = sum(rng.randrange(1 << (nb - 1), 1 << nb) << (nb * i) for i in range(k))
                vs.append({"x": rng.getrandbits(widths["x"]), "a": rng.getrandbits(k * nb), "lo": lo, "hi": hi})
        vs += [{k: rng.getrandbits(w) for k, w in widths.items()} for _ in range(30 - len(vs))]
        bad = sum(chk.evaluate(stem, params, v, ["y"], widths) != ref(v) for v in vs)
        print(f"{name}: {len(vs) - bad}/{len(vs)} vectors match", flush=True)
        ok &= bad == 0
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
