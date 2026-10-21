"""Sweep the OpenRAM access-energy scale (value read as mW over one cycle of T ns) against accel-pdkprice's thresholds.
Reads data/pdkprice_results.json only; stdlib. Writes results.json, results.txt."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(ROOT, "src"))
from accel_pdkperiod import scale

R = json.load(open(os.path.join(ROOT, "data", "pdkprice_results.json")))
macros, rows = R["macros"], R["breakeven"]
PERIODS = [0.1, 0.5, 1, 2, 3, 5, 10, 20]   # ns; 1 = the file read as pJ; the file's own minimum_period is 0.09-0.10 ns
cells = []
for r in rows:
    for m in macros:
        for packed in (False, True):
            ew = m["access_pj"] / (m["width"] // 4) if packed else m["access_pj"]
            cells.append(dict(shape=r["shape"], B=r["B"], width=m["width"], packed=packed, e_weight_file=ew,
                              thr=r["min_e_weight_pj"], flip_T_ns=scale.flip_scale(r["min_e_weight_pj"], ew)))
# T = 1 ns must reproduce accel-pdkprice's register-file verdicts exactly
prev = {(v["shape"], v["B"], v["macro"], v["packed"]): v["flop_ws_wins"] for v in R["verdicts"]}
for c in cells:
    mac = next(m["macro"] for m in macros if m["width"] == c["width"])
    assert scale.ws_wins(c["thr"], c["e_weight_file"], 1.0) == prev[(c["shape"], c["B"], mac, c["packed"])], c
out = []; w = out.append
w(f"{len(cells)} cells = {len(rows)} (shape, B) x {len(macros)} macros x {{unpacked, packed}}. Register-file WS beats OS iff T x file_value / (weights per access) > threshold.")
w("Cells where register-file WS wins, by assumed cycle period T (ns; per-edge = half the energy):")
w(f"{'T ns':>6} {'all':>5} {'unpacked':>9} {'packed':>7} {'all, per-edge':>14}")
sweep = []
for T in PERIODS:
    def n(sel, pe=False):
        return sum(scale.ws_wins(c["thr"], c["e_weight_file"], scale.energy_pj(1.0, T, pe)) for c in cells if sel(c))
    a, u, p, pe = n(lambda c: True), n(lambda c: not c["packed"]), n(lambda c: c["packed"]), n(lambda c: True, True)
    sweep.append(dict(T_ns=T, ws_all=a, ws_unpacked=u, ws_packed=p, ws_all_per_edge=pe))
    w(f"{T:>6g} {a:>5} {u:>9} {p:>7} {pe:>14}")
fl = sorted(c["flip_T_ns"] for c in cells)
def q(f): return fl[min(len(fl) - 1, int(f * len(fl)))]
w("")
w(f"Flip period (the T at which a cell changes verdict): min {fl[0]:.3g} ns, median {q(.5):.3g} ns, max {fl[-1]:.3g} ns.")
for packed in (False, True):
    f = sorted(c["flip_T_ns"] for c in cells if c["packed"] == packed)
    w(f"  {'packed' if packed else 'unpacked'}: min {f[0]:.3g} ns, median {f[len(f)//2]:.3g} ns, max {f[-1]:.3g} ns")
w("Partial sums in SRAM: e_psum / e_weight is a ratio of two accesses of the same macro, so the scale cancels; every verdict is unchanged for any T.")
json.dump(dict(periods=sweep, cells=cells), open(os.path.join(HERE, "results.json"), "w"), indent=1)
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
