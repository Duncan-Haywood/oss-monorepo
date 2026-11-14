"""Milestone 123: checks the blind designs before any flow run (Yosys on PATH; about a minute).

wsumsh_w (OW = 32, K = 3; OW = 7, K = 4), mulsh_w (OW = 12, K = 2; OW = 7, K = 3) and xorsh_w (K = 4, 8) at W = 128 are checked
against a Python reference with Yosys `eval` on 30 vectors each (seed 123), including all-zero and all-one operands. Prints one line
per design and exits 1 on any mismatch. Uses experiments/shift_power/check_designs.py's `evaluate`, unchanged.
"""
import importlib.util
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("vdse_m120_check_for_m123", HERE.parent / "shift_power" / "check_designs.py")
chk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chk)
W, SW = 128, 7
FULL = (1 << W) - 1


def fields(v, ow, n):
    return [(v >> (i * ow)) & ((1 << ow) - 1) for i in range(n)]


def wsum_ref(x, a, b, ow, k):
    s = a
    for t in fields(b, ow, k - 1):
        s = (s + t) % (1 << ow)
    return {"y": x >> (s >> (ow - SW))}


def mul_ref(x, a, b, ow, k):
    s = a
    for t in fields(b, ow, k):
        s = (s * t) >> ow
    return {"y": (x << (s >> (ow - SW))) & FULL}


def xor_ref(x, a, b, k):
    s = a
    for t in fields(b, SW, k - 1):
        s ^= t
    return {"y": x >> s}


def vectors(rng, ow, nb):
    full_a, full_b = (1 << ow) - 1, (1 << nb) - 1
    return [(FULL, 0, 0), (FULL, full_a, full_b), (1, full_a, 0), (1 << 127, 0, full_b)] + \
           [(rng.getrandbits(W), rng.getrandbits(ow), rng.getrandbits(nb)) for _ in range(26)]


def main():
    rng = random.Random(123)
    ok = True
    cases = [("wsum3w", "wsumsh_w", {"W": W, "SW": SW, "OW": 32, "K": 3}, 32, 32 * 2, lambda x, a, b: wsum_ref(x, a, b, 32, 3)),
             ("wsum4n", "wsumsh_w", {"W": W, "SW": SW, "OW": 7, "K": 4}, 7, 7 * 3, lambda x, a, b: wsum_ref(x, a, b, 7, 4)),
             ("mul2w", "mulsh_w", {"W": W, "SW": SW, "OW": 12, "K": 2}, 12, 12 * 2, lambda x, a, b: mul_ref(x, a, b, 12, 2)),
             ("mul3n", "mulsh_w", {"W": W, "SW": SW, "OW": 7, "K": 3}, 7, 7 * 3, lambda x, a, b: mul_ref(x, a, b, 7, 3)),
             ("xor4", "xorsh_w", {"W": W, "SW": SW, "K": 4}, 7, 7 * 3, lambda x, a, b: xor_ref(x, a, b, 4)),
             ("xor8", "xorsh_w", {"W": W, "SW": SW, "K": 8}, 7, 7 * 7, lambda x, a, b: xor_ref(x, a, b, 8))]
    for name, stem, params, ow, nb, ref in cases:
        vs = vectors(rng, ow, nb)
        bad = sum(chk.evaluate(stem, params, {"x": x, "a": a, "b": b}, ["y"], {"x": W, "a": ow, "b": nb}) != ref(x, a, b)
                  for x, a, b in vs)
        print(f"{name}: {len(vs) - bad}/{len(vs)} vectors match")
        ok &= bad == 0
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
