"""Sweep batch size on the two accel-kws layer shapes for the four gated_engine modes: RTL simulation (bit-exact against
NumPy, fetch counts, accumulator bits written) and Yosys synthesis to SKY130 HD. Needs the liberty file
(sh ../accel-pdkprice/fetch_pdk.sh ../accel-pdkprice/pdk). Writes results.json and results.txt."""
import json, os, re, sys
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "accel-gatedprice", "src"))
import numpy as np
from accel_gatedrtl import rtl
from accel_gatedprice import lib

PDK = next((p for p in (os.path.join(HERE, "..", "pdk"), os.path.join(HERE, "..", "..", "accel-pdkprice", "pdk"), "/tmp/pdk")
            if os.path.exists(os.path.join(p, rtl.LIB_REL))), None)
if PDK is None:
    sys.exit("run: sh ../accel-pdkprice/fetch_pdk.sh ../accel-pdkprice/pdk")
LIBTXT = open(os.path.join(PDK, rtl.LIB_REL)).read()
assert lib.units_ok(LIBTXT)
SHAPES = {"L1 64x70": (64, 70), "L2 11x64": (11, 64)}
BATCHES = (2, 4, 8, 16)
P, N, VDD = 8, 2, 1.8
PRE = "sky130_fd_sc_hd__"
E_FLOP = lib.clock_pin_energy(LIBTXT, PRE + "dfxtp_1", "CLK", vdd=VDD)["total_pj"] * 1000   # fJ per clock cycle, clock pin only
E_ICG = lib.clock_pin_energy(LIBTXT, PRE + "dlclkp_1", "CLK", vdd=VDD)["total_pj"] * 1000
AREA = {c: float(re.search(r"\barea\s*:\s*([\d.]+)\s*;", lib.cell_block(LIBTXT, PRE + c)).group(1))
        for c in ("dfxtp_1", "dlclkp_1", "mux2_1", "edfxtp_1")}


def point(args):
    shape, O, I, B, mode = args
    W, X = rtl.random_problem(O, I, B, N, seed=O * 1000 + I + B)
    ref = np.einsum("nbi,oi->nbo", X, W)
    m, y = rtl.simulate(mode, O, I, B, P, W, X)
    s = rtl.synth(mode, O, I, B, P, PDK)
    ns = 1 if mode == 0 else B
    n_acc = ns * P * rtl.ACCW
    gates = s["icgs"]
    written = int(m[0, 3])
    cycles = int(m[0, 0])
    # clock-pin energy per running cycle of the accumulator file (fJ): ungated flops see the clock every cycle;
    # gated flops see it only when their gate is open, and every gate sees it every cycle.
    e_clk = (n_acc * E_FLOP) if mode < 2 else (gates * E_ICG + written / cycles * E_FLOP)
    return dict(shape=shape, O=O, I=I, B=B, P=P, mode=mode, design=rtl.MODES[mode], cycles=cycles, w_rd=int(m[0, 1]),
                x_rd=int(m[0, 2]), written_bits=written, const=bool((m == m[0]).all()), bit_exact=bool((y == ref).all()),
                acc_flops=n_acc, cells=s["cells"], flops=s["flops"], icgs=gates, area_um2=s["area_um2"],
                clk_fj_per_cycle=e_clk)


jobs = [(sn, O, I, B, mode) for sn, (O, I) in SHAPES.items() for B in BATCHES for mode in range(4)]
with ThreadPoolExecutor(max_workers=os.cpu_count() or 2) as ex:
    rows = list(ex.map(point, jobs))
json.dump(dict(e_flop_fj=E_FLOP, e_icg_fj=E_ICG, cell_area_um2=AREA, rows=rows), open(os.path.join(HERE, "results.json"), "w"), indent=1)

by = {(r["shape"], r["B"], r["mode"]): r for r in rows}
out = []
w = out.append
w(f"{len(rows)} points: P = {P} lanes, {N} random problems each, int4 weights, int8 inputs, 24-bit accumulators; Yosys to SKY130 HD tt_025C_1v80.")
w(f"bit-exact against NumPy in all runs: {all(r['bit_exact'] for r in rows)}; counts identical across the {N} problems: {all(r['const'] for r in rows)}")
w(f"WS cycles and weight/activation fetches identical across the three WS modes: "
  f"{all(len({(by[(s, B, m)]['cycles'], by[(s, B, m)]['w_rd'], by[(s, B, m)]['x_rd']) for m in (1, 2, 3)}) == 1 for s in SHAPES for B in BATCHES)}")
w(f"accumulator bits written per problem identical across all four modes at each point: "
  f"{all(len({by[(s, B, m)]['written_bits'] for m in range(4)}) == 1 for s in SHAPES for B in BATCHES)}")
w(f"per-cycle clock-pin energy from the liberty file: dfxtp_1 {E_FLOP:.1f} fJ, dlclkp_1 {E_ICG:.1f} fJ (ratio {E_ICG / E_FLOP:.2f}); "
  f"areas um2: " + ", ".join(f"{k} {v}" for k, v in AREA.items()))
w("\nshape      B design         cycles  w_fetch  flops  gates   cells   area_um2  area/OS  area/ungated  clk_fJ/cyc  clk/OS  clk/ungated")
for s in SHAPES:
    for B in BATCHES:
        os_, un = by[(s, B, 0)], by[(s, B, 1)]
        for m in range(4):
            r = by[(s, B, m)]
            w(f"{s:9s} {B:2d} {r['design']:12s} {r['cycles']:7d} {r['w_rd']:8d} {r['flops']:6d} {r['icgs']:5d} {r['cells']:7d} "
              f"{r['area_um2']:10.0f} {r['area_um2'] / os_['area_um2']:8.2f} {r['area_um2'] / un['area_um2']:12.2f} "
              f"{r['clk_fj_per_cycle']:11.0f} {r['clk_fj_per_cycle'] / os_['clk_fj_per_cycle']:7.2f} "
              f"{r['clk_fj_per_cycle'] / un['clk_fj_per_cycle']:11.2f}")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
