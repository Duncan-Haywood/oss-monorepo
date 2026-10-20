"""Breakeven constants from the accel-planebatch RTL counts. Writes results.json and results.txt (stdlib only)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_fetchprice import model

rows = model.load()
out, res = [], []
w = out.append
w("Breakeven constants from RTL counts (accel-planebatch, P = 8). No energy constant here is measured.")
w("e_flop* = weight-fetch energies saved / (extra flops x cycles), in units of one weight fetch per flop-cycle.")
w("r_psum* = psum SRAM word energy / weight fetch energy at which the model's WS (psum in SRAM) ties OS.")
w("")
w(f"{'shape':9} {'B':>2} {'w_saved':>7} {'extra_flops':>11} {'cycles':>6} {'e_flop*/e_w':>12} {'psum_extra':>10} {'r_psum*':>8}")
for shape in ("L1 64x70", "L2 11x64"):
    for B in (1, 2, 4, 8, 16):
        o, ws = model.pair(rows, shape, B)
        ef = model.breakeven_flop_cycle(o, ws, 1.0)
        rp = model.breakeven_psum_ratio(o, ws)
        r = dict(shape=shape, B=B, w_saved=model.weight_fetches_saved(o, ws), extra_flops=model.extra_flops(o, ws),
                 cycles=ws["rtl_cycles"], e_flop_star_over_e_w=ef,
                 psum_extra=model.psum_words(ws) - model.psum_words(o), r_psum_star=rp)
        res.append(r)
        f = lambda v, p: "-" if v is None else format(v, p)
        w(f"{shape:9} {B:>2} {r['w_saved']:>7} {r['extra_flops']:>11} {r['cycles']:>6} {f(ef, '12.2e'):>12} {r['psum_extra']:>10} {f(rp, '8.3f'):>8}")
json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
