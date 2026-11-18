"""Milestone 121: checks the blind designs before any flow run (Yosys on PATH; about a minute).

addsh_w, fpalign_w and pcsh_w at both blind widths are checked against a Python reference with Yosys `eval` on 30 vectors each
(seed 121), including all-zero and all-one inputs and, for fpalign, ea = eb and differences of W or more.
Prints one line per design and exits 1 on any mismatch. Uses experiments/shift_power/check_designs.py's `evaluate`, unchanged.
"""
import importlib.util
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("vdse_m120_check", HERE.parent / "shift_power" / "check_designs.py")
chk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chk)


def addsh_ref(x, a, b, w, sw):
    return {"y": x >> ((a + b) % (1 << sw))}


def fpalign_ref(x, ea, eb, w):
    return {"y": x >> abs(ea - eb)}


def pcsh_ref(x, m, w):
    return {"y": (x << bin(m).count("1")) & ((1 << w) - 1)}


def main():
    rng = random.Random(121)
    ok = True
    for w, sw in ((64, 6), (128, 7)):
        full = (1 << w) - 1
        vs = [(full, 0, 0), (full, (1 << sw) - 1, 1), (1 << (w - 1), 3, 5)] + \
             [(rng.getrandbits(w), rng.getrandbits(sw), rng.getrandbits(sw)) for _ in range(27)]
        bad = sum(chk.evaluate("addsh_w", {"W": w, "SW": sw}, {"x": x, "a": a, "b": b}, ["y"], {"x": w, "a": sw, "b": sw})
                  != addsh_ref(x, a, b, w, sw) for x, a, b in vs)
        print(f"addsh{w}: {len(vs) - bad}/{len(vs)} vectors match")
        ok &= bad == 0
        vs = [(full, 100, 100), (full, 0, 255), (full, 200, 200 - w), (full, 10, 10 + w - 1)] + \
             [(rng.getrandbits(w), rng.getrandbits(8), rng.getrandbits(8)) for _ in range(13)] + \
             [(rng.getrandbits(w), e, max(0, e - rng.randrange(w))) for e in (rng.getrandbits(8) for _ in range(13))]
        bad = sum(chk.evaluate("fpalign_w", {"W": w, "EW": 8}, {"x": x, "ea": a, "eb": b}, ["y"], {"x": w, "ea": 8, "eb": 8})
                  != fpalign_ref(x, a, b, w) for x, a, b in vs)
        print(f"fpalign{w}: {len(vs) - bad}/{len(vs)} vectors match")
        ok &= bad == 0
        cw = sw + 1
        vs = [(full, 0), (full, full), (1, 1), (full, 1 << (w - 1))] + \
             [(rng.getrandbits(w), rng.getrandbits(w) & rng.getrandbits(w) & rng.getrandbits(w)) for _ in range(13)] + \
             [(rng.getrandbits(w), rng.getrandbits(w)) for _ in range(13)]
        bad = sum(chk.evaluate("pcsh_w", {"W": w, "CW": cw}, {"x": x, "m": m}, ["y"], {"x": w, "m": w}) != pcsh_ref(x, m, w)
                  for x, m in vs)
        print(f"pcsh{w}: {len(vs) - bad}/{len(vs)} vectors match")
        ok &= bad == 0
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
