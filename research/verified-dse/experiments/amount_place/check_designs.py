"""Milestone 124: checks the blind designs before any flow run (Yosys on PATH; about a minute).

Each of the seven blind designs is checked against a Python reference with Yosys `eval` on 30 vectors (seed 124), including
all-zero and all-one operands. Prints one line per design and exits 1 on any mismatch. Uses experiments/shift_power/check_designs.py's
`evaluate`, unchanged.
"""
import importlib.util
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("vdse_m120_check_for_m124", HERE.parent / "shift_power" / "check_designs.py")
chk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chk)
spec = importlib.util.spec_from_file_location("vdse_m124_run_for_check", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def fields(v, w, n):
    return [(v >> (i * w)) & ((1 << w) - 1) for i in range(n)]


def max_ref(p, x, f):
    return {"y": x >> max(fields(f, p["SW"], p["N"]))}


def sad_ref(p, x, a, b):
    sw, k = p["SW"], p["K"]
    s = sum(abs(u - v) for u, v in zip(fields(a, sw, k), fields(b, sw, k))) % (1 << sw)
    return {"y": (x << s) & ((1 << p["W"]) - 1)}


def sat_ref(p, x, a, b):
    sw = p["SW"]
    s = a
    for t in fields(b, sw, p["K"]):
        s = min(s + t, (1 << sw) - 1)
    return {"y": x >> s}


def ports(stem, p):
    """Input names and widths, and the reference, for one family."""
    sw = p["SW"]
    if stem == "maxsh_w":
        return {"x": p["W"], "f": sw * p["N"]}, lambda v: max_ref(p, v["x"], v["f"])
    if stem == "sadsh_w":
        return {"x": p["W"], "a": sw * p["K"], "b": sw * p["K"]}, lambda v: sad_ref(p, v["x"], v["a"], v["b"])
    return {"x": p["W"], "a": sw, "b": sw * p["K"]}, lambda v: sat_ref(p, v["x"], v["a"], v["b"])


def main():
    rng = random.Random(124)
    ok = True
    for name, (stem, _, params, _) in run.NEW.items():
        widths, ref = ports(stem, params)
        vs = [{k: 0 for k in widths}, {k: (1 << w) - 1 for k, w in widths.items()},
              {k: (1 if k == "x" else (1 << w) - 1) for k, w in widths.items()},
              {k: (1 << (w - 1) if k == "x" else 0) for k, w in widths.items()}]
        vs += [{k: rng.getrandbits(w) for k, w in widths.items()} for _ in range(26)]
        bad = sum(chk.evaluate(stem, params, v, ["y"], widths) != ref(v) for v in vs)
        print(f"{name}: {len(vs) - bad}/{len(vs)} vectors match")
        ok &= bad == 0
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
