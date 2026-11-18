"""Milestone 122: checks the blind designs before any flow run (Yosys on PATH; about a minute).

chainsh_w (K = 2, 8), pcnsh_w (M = 6, 24) and tzcsh_w (N = 4, 8) at W = 128 are checked against a Python reference with Yosys `eval`
on 30 vectors each (seed 122), including all-zero and all-one inputs and, for tzcsh, r = 0. Prints one line per design and exits 1 on
any mismatch. Uses experiments/shift_power/check_designs.py's `evaluate`, unchanged.
"""
import importlib.util
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("vdse_m120_check_for_m122", HERE.parent / "shift_power" / "check_designs.py")
chk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chk)
W = 128
FULL = (1 << W) - 1


def chainsh_ref(x, a, b, c, k, sw=7):
    s = a
    for _ in range(k):
        s = ((s ^ b) + c) % (1 << sw)
    return {"y": x >> s}


def pcnsh_ref(x, m):
    return {"y": (x << bin(m).count("1")) & FULL}


def tzcsh_ref(x, r, n, lane):
    z = n if r == 0 else (r & -r).bit_length() - 1
    return {"y": x >> (z * lane)}


def main():
    rng = random.Random(122)
    ok = True
    for k in (2, 8):
        vs = [(FULL, 0, 0, 0), (FULL, 127, 127, 127), (1 << 127, 5, 3, 9)] + \
             [(rng.getrandbits(W), rng.getrandbits(7), rng.getrandbits(7), rng.getrandbits(7)) for _ in range(27)]
        bad = sum(chk.evaluate("chainsh_w", {"W": W, "SW": 7, "K": k}, {"x": x, "a": a, "b": b, "c": c}, ["y"],
                               {"x": W, "a": 7, "b": 7, "c": 7}) != chainsh_ref(x, a, b, c, k) for x, a, b, c in vs)
        print(f"chainsh{k}: {len(vs) - bad}/{len(vs)} vectors match")
        ok &= bad == 0
    for m, cw in ((6, 3), (24, 5)):
        vs = [(FULL, 0), (FULL, (1 << m) - 1), (1, 1), (FULL, 1 << (m - 1))] + \
             [(rng.getrandbits(W), rng.getrandbits(m)) for _ in range(26)]
        bad = sum(chk.evaluate("pcnsh_w", {"W": W, "M": m, "CW": cw}, {"x": x, "m": mm}, ["y"], {"x": W, "m": m}) != pcnsh_ref(x, mm)
                  for x, mm in vs)
        print(f"pcnsh{m}: {len(vs) - bad}/{len(vs)} vectors match")
        ok &= bad == 0
    for n, zw, lane in ((4, 3, 32), (8, 4, 16)):
        vs = [(FULL, 0), (FULL, (1 << n) - 1), (FULL, 1 << (n - 1)), (1 << 127, 1 << (n - 1))] + \
             [(rng.getrandbits(W), rng.getrandbits(n)) for _ in range(26)]
        bad = sum(chk.evaluate("tzcsh_w", {"W": W, "N": n, "ZW": zw, "LANE": lane}, {"x": x, "r": r}, ["y"], {"x": W, "r": n})
                  != tzcsh_ref(x, r, n, lane) for x, r in vs)
        print(f"tzcsh{n}: {len(vs) - bad}/{len(vs)} vectors match")
        ok &= bad == 0
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
