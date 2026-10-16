"""Sweep the lane count P of accel-gatedrtl's four engine modes on the 64x70 accel-kws layer at B = 4 and 8: RTL simulation
(bit-exact against NumPy, accumulator bits written) and Yosys synthesis to SKY130 HD. Reuses accel-gatedrtl's rtl.py unchanged.
Needs the liberty file (sh ../accel-pdkprice/fetch_pdk.sh ../accel-pdkprice/pdk). Writes results.json and results.txt."""
import json, os, re, sys
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "accel-gatedrtl", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "accel-gatedprice", "src"))
import numpy as np
from accel_gatedrtl import rtl
from accel_gatedprice import lib

PDK = next((p for p in (os.path.join(HERE, "..", "..", "accel-pdkprice", "pdk"), "/tmp/pdk")
            if os.path.exists(os.path.join(p, rtl.LIB_REL))), None)
if PDK is None:
    sys.exit("run: sh ../accel-pdkprice/fetch_pdk.sh ../accel-pdkprice/pdk")
LIBTXT = open(os.path.join(PDK, rtl.LIB_REL)).read()
assert lib.units_ok(LIBTXT)
O, I = 64, 70
CACHE = os.path.join(HERE, ".cache")
os.makedirs(CACHE, exist_ok=True)
import resource
resource.setrlimit(resource.RLIMIT_AS, (7 << 30, 7 << 30))   # inherited by each Yosys: a point that needs more fails alone
BATCHES = (4, 8)
LANES = (2, 4, 8, 16, 32)
SKIP = {(16, 8), (32, 8)}   # two earlier attempts had Yosys killed for memory (6 GB each) on the larger points; B = 8 stops at P = 8
N, VDD = 2, 1.8
PRE = "sky130_fd_sc_hd__"
E_FLOP = lib.clock_pin_energy(LIBTXT, PRE + "dfxtp_1", "CLK", vdd=VDD)["total_pj"] * 1000
E_ICG = lib.clock_pin_energy(LIBTXT, PRE + "dlclkp_1", "CLK", vdd=VDD)["total_pj"] * 1000


def point(args):
    P, B, mode = args
    W, X = rtl.random_problem(O, I, B, N, seed=O * 1000 + I + B)
    ref = np.einsum("nbi,oi->nbo", X, W)
    m, y = rtl.simulate(mode, O, I, B, P, W, X)
    key = f"{P}_{B}_{mode}"
    cp = os.path.join(CACHE, key + ".json")
    if os.path.exists(cp):
        s = json.load(open(cp))
    else:
        try:
            s = rtl.synth(mode, O, I, B, P, PDK)
        except Exception as e:   # memory limit or Yosys error: record, do not hide
            s = dict(failed=str(e)[-200:])
        json.dump(s, open(cp, "w"))
    if "failed" in s:
        return dict(P=P, B=B, mode=mode, design=rtl.MODES[mode], failed=s["failed"])
    n_acc = (1 if mode == 0 else B) * P * rtl.ACCW
    written, cycles = int(m[0, 3]), int(m[0, 0])
    e_clk = (n_acc * E_FLOP) if mode < 2 else (s["icgs"] * E_ICG + written / cycles * E_FLOP)
    return dict(P=P, B=B, mode=mode, design=rtl.MODES[mode], cycles=cycles, w_rd=int(m[0, 1]), x_rd=int(m[0, 2]),
                written_bits=written, const=bool((m == m[0]).all()), bit_exact=bool((y == ref).all()), acc_flops=n_acc,
                cells=s["cells"], flops=s["flops"], icgs=s["icgs"], area_um2=s["area_um2"], clk_fj_per_cycle=e_clk)


if __name__ == "__main__":
    jobs = [(P, B, mode) for P in LANES for B in BATCHES for mode in range(4) if (P, B) not in SKIP]
    with ThreadPoolExecutor(max_workers=2) as ex:
        rows = list(ex.map(point, jobs))
    failed = [r for r in rows if "failed" in r]
    rows = [r for r in rows if "failed" not in r]
    json.dump(dict(e_flop_fj=E_FLOP, e_icg_fj=E_ICG, failed=[(r["P"], r["B"], r["design"]) for r in failed], rows=rows), open(os.path.join(HERE, "results.json"), "w"), indent=1)
    by = {(r["P"], r["B"], r["mode"]): r for r in rows}
    ok = lambda P, B: all((P, B, m) in by for m in range(4))
    out = []
    w = out.append
    w(f"{len(rows)} points: layer {O}x{I}, {N} random problems each, int4 weights, int8 inputs, 24-bit accumulators; Yosys to SKY130 HD tt_025C_1v80.")
    w(f"synthesis failures (memory limit 7 GB): {[(r['P'], r['B'], r['design']) for r in failed] or 'none'}")
    w(f"bit-exact against NumPy in all runs: {all(r['bit_exact'] for r in rows)}; counts identical across problems: {all(r['const'] for r in rows)}")
    w(f"accumulator bits written identical across the four modes at each (P, B): "
      f"{all(len({by[(P, B, m)]['written_bits'] for m in range(4)}) == 1 for P in LANES for B in BATCHES if ok(P, B))}")
    w("\n  P  B design         cycles  w_fetch  flops  gates   cells  area_um2  area/OS  area/ungated  clk_fJ/cyc  clk/OS")
    for B in BATCHES:
        for P in LANES:
            if not ok(P, B):
                continue
            os_, un = by[(P, B, 0)], by[(P, B, 1)]
            for m in range(4):
                r = by[(P, B, m)]
                w(f"{P:3d} {B:2d} {r['design']:12s} {r['cycles']:7d} {r['w_rd']:8d} {r['flops']:6d} {r['icgs']:5d} {r['cells']:7d} "
                  f"{r['area_um2']:9.0f} {r['area_um2'] / os_['area_um2']:8.2f} {r['area_um2'] / un['area_um2']:12.2f} "
                  f"{r['clk_fj_per_cycle']:11.0f} {r['clk_fj_per_cycle'] / os_['clk_fj_per_cycle']:7.2f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))
