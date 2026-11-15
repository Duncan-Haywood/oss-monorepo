"""Milestone 125: checks the blind designs before any flow run (Yosys on PATH; about a minute).

Each of the eight blind designs is checked against a Python reference with Yosys `eval` on 30 vectors (seed 125), including
all-zero and all-one operands. Prints one line per design and exits 1 on any mismatch. Uses experiments/shift_power/check_designs.py's
`evaluate`, unchanged.
"""
import importlib.util
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("vdse_m120_check_for_m125", HERE.parent / "shift_power" / "check_designs.py")
chk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chk)
spec = importlib.util.spec_from_file_location("vdse_m125_run_for_check", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def fields(v, w, n):
    return [(v >> (i * w)) & ((1 << w) - 1) for i in range(n)]


def ports(stem, p):
    """Input names and widths, and the reference, for one family."""
    w, sw = p["W"], p["SW"]
    mask = (1 << w) - 1
    if stem == "pmulsh_w":
        return {"x": w, "a": p["NA"], "b": sw}, lambda v: {"y": (v["x"] << ((v["a"] * v["b"]) % (1 << sw))) & mask}
    if stem == "avgsh_w":
        nb = p["NB"]
        return ({"x": w, "a": nb, "b": nb, "c": nb},
                lambda v: {"y": v["x"] >> (((v["a"] + v["b"] + v["c"]) >> (nb + 2 - sw)) & ((1 << sw) - 1))})
    if stem == "selsh_w":
        np_ = p["NP"]
        return ({"x": w, "p": np_, "q": np_, "a": sw, "b": sw},
                lambda v: {"y": v["x"] >> (v["a"] if v["p"] > v["q"] else v["b"])})

    def lanes(v):
        s = v["a"]
        for t in fields(v["b"], sw, p["K"]):
            s = min(s + t, (1 << sw) - 1)
        return {"y": sum((xl >> s) << (j * w) for j, xl in enumerate(fields(v["x"], w, p["L"])))}
    return {"x": w * p["L"], "a": sw, "b": sw * p["K"]}, lanes


def main():
    rng = random.Random(125)
    ok = True
    for name, (stem, _, params, _) in run.NEW.items():
        widths, ref = ports(stem, params)
        vs = [{k: 0 for k in widths}, {k: (1 << w) - 1 for k, w in widths.items()},
              {k: (1 if k == "x" else (1 << w) - 1) for k, w in widths.items()},
              {k: (1 << (w - 1) if k == "x" else 0) for k, w in widths.items()}]
        vs += [{k: rng.getrandbits(w) for k, w in widths.items()} for _ in range(26)]
        bad = sum(chk.evaluate(stem, params, v, ["y"], widths) != ref(v) for v in vs)
        print(f"{name}: {len(vs) - bad}/{len(vs)} vectors match", flush=True)
        ok &= bad == 0
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
