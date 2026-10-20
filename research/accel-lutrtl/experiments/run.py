"""Sweep layer width N and codebook size K: bit-exact check of both engines, cycles, Yosys area."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from accel_lutrtl import flow

CONFIGS = [(8, 16), (16, 16), (32, 16), (64, 16), (128, 16), (32, 8), (32, 4)]
SEEDS = (1, 2, 3)
rows = []
for n, k in CONFIGS:
    row = {"N": n, "K": k}
    for e in ("mac", "table"):
        ok_all, cyc = True, None
        for s in SEEDS:
            cb, idx, a, y = flow.make_layer(n, k, s)
            ok, c = flow.simulate(e, n, k, cb, idx, a, y)
            ok_all &= ok
            assert cyc in (None, c)
            cyc = c
        cb, idx, a, y = flow.make_layer(n, k, 1)
        sm = flow.summarise(flow.synth(e, n, k, cb, idx, a))
        row[e] = {"bit_exact_3_seeds": bool(ok_all), "cycles": cyc, **sm,
                  "stored_bits": (8 * flow.FIN * n) if e == "mac" else (4 * flow.FIN * n if k > 8 else
                                                                         (3 if k == 8 else 2) * flow.FIN * n) + 8 * k}
    rows.append(row)
json.dump(rows, open(os.path.join(os.path.dirname(__file__), "results.json"), "w"), indent=1)
