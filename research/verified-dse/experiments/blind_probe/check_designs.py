"""Milestone 132: checks the blind designs before any flow run (Yosys on PATH; about a minute).

Each of the six blind designs is checked against a Python reference with Yosys `eval` on 30 vectors (seed 132), including
all-zero and all-one operands. Prints one line per design and exits 1 on any mismatch. Uses experiments/shift_power/check_designs.py's
`evaluate`, unchanged.
"""
import importlib.util
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("vdse_m120_check_for_m132", HERE.parent / "shift_power" / "check_designs.py")
chk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chk)
spec = importlib.util.spec_from_file_location("vdse_m132_run_for_check", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def lut_table():
    p = list(range(128))
    random.Random(132).shuffle(p)
    return p


def gray2bin(g, sw):
    d, acc = 0, 0
    for i in range(sw - 1, -1, -1):
        acc ^= (g >> i) & 1
        d |= acc << i
    return d


def ports(stem, p):
    """Input names and widths, and the reference, for one family."""
    w, sw = p["W"], p["SW"]
    mask, smask = (1 << w) - 1, (1 << sw) - 1
    if stem == "graysh_w":
        k = p["K"]

        def gray(v):
            s = gray2bin(v["g"], sw)
            for i in range(k):
                s = (s + ((v["b"] >> (i * sw)) & smask)) & smask
            return {"y": (v["x"] << s) & mask}
        return {"x": w, "g": sw, "b": sw * max(k, 1)}, gray
    if stem == "modsh_w":
        return {"x": w, "a": p["NA"]}, lambda v: {"y": v["x"] >> ((v["a"] % p["M"]) & smask)}
    lut, r = lut_table(), p["R"]

    def sub(v):
        s = v["a"]
        for i in range(r):
            s = lut[s ^ ((v["k"] >> (i * sw)) & smask)]
        return {"y": (v["x"] << s) & mask}
    return {"x": w, "a": sw, "k": sw * r}, sub


def main():
    rng = random.Random(132)
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
