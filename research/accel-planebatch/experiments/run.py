"""Sweep batch size on the two accel-kws layer shapes, OS vs WS batched RTL engines. Writes results.json, results.txt."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
from accel_planebatch import rtl

SHAPES = {"L1 64x70": (64, 70), "L2 11x64": (11, 64)}
BATCHES = (1, 2, 4, 8, 16)
P = 8
N = 2
rows = []
for sname, (O, I) in SHAPES.items():
    for B in BATCHES:
        W, X = rtl.random_problem(O, I, B, N, seed=O * 1000 + I + B)
        ref = np.einsum("nbi,oi->nbo", X, W)
        for d in rtl.DESIGNS:
            m, y = rtl.simulate(d, O, I, B, P, W, X)
            c = rtl.model(d, O, I, B, P)
            s = rtl.synth(d, O, I, B, P)
            rows.append(dict(shape=sname, O=O, I=I, B=B, P=P, design=d, rtl_cycles=int(m[0, 0]), rtl_w_rd=int(m[0, 1]),
                             rtl_x_rd=int(m[0, 2]), model_cycles=c["cycles"], model_w_rd=c["w_rd"], model_x_rd=c["x_rd"],
                             model_p_wr=c["p_wr"], model_p_rd=c["p_rd"], const=bool((m == m[0]).all()),
                             bit_exact=bool((y == ref).all()), cells=s["cells"], flops=s["flops"]))
json.dump(rows, open(os.path.join(HERE, "results.json"), "w"), indent=1)

out = []
w = out.append
w(f"{len(rows)} RTL runs (P = {P} lanes, {N} random problems each, int4 weights, int8 inputs, 24-bit accumulators) and Yosys syntheses.")
w(f"bit-exact against NumPy in all runs: {all(r['bit_exact'] for r in rows)}; counts identical across the {N} problems: {all(r['const'] for r in rows)}")
w(f"weight fetches RTL == schedule model in all runs: {all(r['rtl_w_rd'] == r['model_w_rd'] for r in rows)}")
w(f"activation fetches RTL == schedule model in all runs: {all(r['rtl_x_rd'] == r['model_x_rd'] for r in rows)}")
for d in rtl.DESIGNS:
    offs = sorted({r['rtl_cycles'] - r['model_cycles'] for r in rows if r['design'] == d})
    w(f"{d}: RTL cycles minus schedule-model cycles takes values {offs} over {sum(r['design'] == d for r in rows)} points")
w("\nshape      B design cycles  w_fetch  x_fetch  cells  flops  model_psum_wr(SRAM, not built)")
for r in rows:
    w(f"{r['shape']:9s} {r['B']:2d} {r['design']:3s} {r['rtl_cycles']:7d} {r['rtl_w_rd']:8d} {r['rtl_x_rd']:8d} {r['cells']:6d} {r['flops']:6d} {r['model_p_wr']:8d}")
txt = "\n".join(out)
open(os.path.join(HERE, "results.txt"), "w").write(txt + "\n")
print(txt)
