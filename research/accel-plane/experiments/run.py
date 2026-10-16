"""Sweep P-lane OS / RT / RT-pipelined engines over the two accel-kws layer shapes. Writes results.json, results.txt."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
from accel_plane import rtl

SHAPES = {"L1 64x70": (64, 70), "L2 11x64": (11, 64)}
LANES = (1, 2, 4, 8, 16, 32)
N = 4
rows = []
for sname, (O, I) in SHAPES.items():
    W, X = rtl.random_problem(O, I, N, seed=O * 1000 + I)
    ref = X @ W.T
    for d in rtl.DESIGNS:
        for P in LANES:
            cyc, y = rtl.simulate(d, O, I, P, W, X)
            s = rtl.synth(d, O, I, P)
            rows.append(dict(shape=sname, O=O, I=I, design=d, P=P, rtl_cycles=int(cyc[0]), cycles_const=bool((cyc == cyc[0]).all()),
                             model_cycles=rtl.model_cycles(d, O, I, P), bit_exact=bool((y == ref).all()),
                             cells=s["cells"], flops=s["flops"]))
json.dump(rows, open(os.path.join(HERE, "results.json"), "w"), indent=1)

out = []
w = out.append
w(f"{len(rows)} RTL runs ({N} random vectors each, int4 weights, int8 inputs, 24-bit accumulators) and Yosys syntheses.")
w(f"bit-exact against NumPy in all runs: {all(r['bit_exact'] for r in rows)}; cycles identical across the {N} vectors: {all(r['cycles_const'] for r in rows)}")
for d in rtl.DESIGNS:
    offs = sorted({r['rtl_cycles'] - r['model_cycles'] for r in rows if r['design'] == d})
    w(f"{d}: RTL cycles minus schedule-model cycles takes values {offs} over all {sum(r['design']==d for r in rows)} points")
w("\n(each row is an engine specialised to its layer shape; cells = Yosys generic gates)")
w("shape design  P  model  RTL  cells  flops  cells*RTLcycles(M)")
for r in rows:
    w(f"{r['shape']:9s} {r['design']:4s} {r['P']:3d} {r['model_cycles']:6d} {r['rtl_cycles']:6d} {r['cells']:7d} {r['flops']:6d} {r['cells'] * r['rtl_cycles'] / 1e6:8.3f}")

txt = "\n".join(out)
open(os.path.join(HERE, "results.txt"), "w").write(txt + "\n")
print(txt)
