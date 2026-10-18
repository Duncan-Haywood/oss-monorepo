"""Re-run accel-planebatch's sweep with the original and the rewritten engine. Writes results.json, results.txt."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
from accel_planemux import rtl

SHAPES = {"L1 64x70": (64, 70), "L2 11x64": (11, 64)}
BATCHES = (1, 2, 4, 8, 16)
P, N = 8, 2
rows = []
for sname, (O, I) in SHAPES.items():
    for B in BATCHES:
        W, X = rtl.random_problem(O, I, B, N, seed=O * 1000 + I + B)
        ref = np.einsum("nbi,oi->nbo", X, W)
        for d in rtl.DESIGNS:
            c = rtl.model(d, O, I, B, P)
            for v in rtl.VARIANTS:
                m, y = rtl.simulate(v, d, O, I, B, P, W, X)
                s = rtl.synth(v, d, O, I, B, P)
                rows.append(dict(shape=sname, O=O, I=I, B=B, P=P, design=d, variant=v, rtl_cycles=int(m[0, 0]),
                                 rtl_w_rd=int(m[0, 1]), rtl_x_rd=int(m[0, 2]), model_cycles=c["cycles"],
                                 model_w_rd=c["w_rd"], model_x_rd=c["x_rd"], bit_exact=bool((y == ref).all()),
                                 cells=s["cells"], flops=s["flops"], secs=s["secs"]))
json.dump(rows, open(os.path.join(HERE, "results.json"), "w"), indent=1)

def get(shape, B, d, v):
    return next(r for r in rows if (r["shape"], r["B"], r["design"], r["variant"]) == (shape, B, d, v))

out = []; w = out.append
w(f"{len(rows)} RTL runs and Yosys syntheses (P = {P}, {N} random problems each, int4 weights, int8 inputs, 24-bit accumulators).")
w(f"bit-exact against NumPy in all runs: {all(r['bit_exact'] for r in rows)}")
same = all(get(r['shape'], r['B'], r['design'], 'orig')[k] == get(r['shape'], r['B'], r['design'], 'new')[k]
           for r in rows for k in ('rtl_cycles', 'rtl_w_rd', 'rtl_x_rd'))
w(f"cycles and weight/activation fetch counts identical between orig and new: {same}")
w(f"flops identical between orig and new: {all(get(r['shape'], r['B'], r['design'], 'orig')['flops'] == get(r['shape'], r['B'], r['design'], 'new')['flops'] for r in rows)}")
w("\nshape      B design  cells_orig cells_new  new/orig  flops  WS/OS_orig  WS/OS_new")
for sname in SHAPES:
    for B in BATCHES:
        for d in rtl.DESIGNS:
            o, n = get(sname, B, d, 'orig'), get(sname, B, d, 'new')
            rat = ""
            if d == "WS":
                rat = f"  {o['cells'] / get(sname, B, 'OS', 'orig')['cells']:.2f}       {n['cells'] / get(sname, B, 'OS', 'new')['cells']:.2f}"
            w(f"{sname:9s} {B:2d} {d:3s}   {o['cells']:9d} {n['cells']:9d}   {n['cells'] / o['cells']:.3f}  {n['flops']:6d}{rat}")
txt = "\n".join(out)
open(os.path.join(HERE, "results.txt"), "w").write(txt + "\n")
print(txt)
