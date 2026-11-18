"""Milestone 133: checks every candidate design before any flow run (Yosys on PATH; about a minute).

Each candidate is checked against a Python reference with Yosys `eval` on 30 vectors (seed 133), including all-zero and all-one
operands. Prints one line per design and exits 1 on any mismatch. Uses experiments/shift_power/check_designs.py's `evaluate`,
unchanged.
"""
import importlib.util
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("vdse_m120_check_for_m133", HERE.parent / "shift_power" / "check_designs.py")
chk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chk)
spec = importlib.util.spec_from_file_location("vdse_m133_run_for_check", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def crc7(v, nb):
    c = 0
    for i in range(nb - 1, -1, -1):
        fb = ((c >> 6) & 1) ^ ((v >> i) & 1)
        c = (c << 1) & 0x7F
        if fb:
            c ^= 0x09
    return c


def ports(stem, p):
    """Input names and widths, and the reference, for one family."""
    w, sw = p["W"], p["SW"]
    mask, smask = (1 << w) - 1, (1 << sw) - 1
    shl = lambda v, s: {"y": (v["x"] << s) & mask}
    if stem == "crc7sh_w":
        return {"x": w, "m": p["NB"]}, lambda v: shl(v, crc7(v["m"], p["NB"]))
    if stem == "fibsh_w":
        na = p["NA"]
        return {"x": w, "a": na}, lambda v: shl(v, ((v["a"] * p["C"]) % (1 << na)) >> (na - sw))
    if stem == "bcdsh_w":
        dd = p["D"]

        def bcd(v):
            s = 0
            for i in range(dd - 1, -1, -1):
                s = (s * 10 + ((v["d"] >> (4 * i)) & 15)) & smask
            return shl(v, s)
        return {"x": w, "d": 4 * dd}, bcd
    np_ = p["NP"]
    return ({"x": w, "p": np_, "q": np_, "a": sw, "b": sw},
            lambda v: shl(v, v["a"] if v["p"] < v["q"] else v["b"]))


def main():
    rng = random.Random(133)
    ok = True
    for name, (stem, _, params, _) in run.CAND.items():
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
